"""Fetch published npm / PyPI package artifacts as DATA -- stdlib only.

Downloads registry metadata (JSON) and a package archive (npm .tgz, PyPI sdist
.tar.gz or wheel .whl), then extracts regular files into a fresh directory with
strict guards. Nothing is installed, imported, built or executed: archives are
read with tarfile/zipfile and only file bytes are written.

    meta = npm_meta("@scope/pkg")                 # packument (all versions)
    info = resolve("npm", "@scope/pkg", "1.2.3")  # {"version", "tarball", "repo", "subdir", "integrity", ...}
    root = fetch_extract(info, dest_dir)          # path of the extracted package root
"""
import io
import json
import os
import posixpath
import tarfile
import urllib.parse
import urllib.request
import zipfile

UA = "atlas-pkgfetch/0.1 (static analysis; never installs)"
MAX_ARCHIVE = 50 * 1024 * 1024
MAX_FILE = 5 * 1024 * 1024
MAX_FILES = 20000
MAX_TOTAL = 200 * 1024 * 1024
ALLOWED_HOSTS = {"registry.npmjs.org", "pypi.org", "files.pythonhosted.org"}


class FetchError(Exception):
    pass


def _get(url, timeout=30, limit=MAX_ARCHIVE):
    host = urllib.parse.urlparse(url).hostname or ""
    if urllib.parse.urlparse(url).scheme != "https" or host not in ALLOWED_HOSTS:
        raise FetchError(f"refusing non-registry URL: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (allow-listed https hosts)
        data = r.read(limit + 1)
    if len(data) > limit:
        raise FetchError(f"response larger than {limit} bytes: {url}")
    return data


def _get_json(url, timeout=30):
    return json.loads(_get(url, timeout, limit=MAX_ARCHIVE).decode("utf-8"))


def npm_meta(name):
    return _get_json("https://registry.npmjs.org/" + urllib.parse.quote(name, safe="@"))


def pypi_meta(name, version=None):
    path = f"{urllib.parse.quote(name)}/{urllib.parse.quote(version)}/json" if version else f"{urllib.parse.quote(name)}/json"
    return _get_json("https://pypi.org/pypi/" + path)


def _norm_repo(u):
    if not u:
        return None
    u = u.strip()
    for pre in ("git+", "git://"):
        if u.startswith(pre):
            u = u[len(pre):] if pre == "git+" else "https://" + u[len(pre):]
    u = u.replace("ssh://git@github.com/", "https://github.com/").replace("git@github.com:", "https://github.com/")
    if u.startswith("github:"):
        u = "https://github.com/" + u[len("github:"):]
    u = u.removesuffix(".git").rstrip("/")
    return u if u.startswith("https://") else None


def resolve(eco, name, version=None, meta=None):
    """Resolve a version (default: latest) to its archive URL and declared repo.

    meta: an already-fetched npm packument, to avoid re-downloading it per version.
    """
    if eco == "npm":
        meta = meta or npm_meta(name)
        ver = version or (meta.get("dist-tags") or {}).get("latest")
        v = (meta.get("versions") or {}).get(ver)
        if not v:
            raise FetchError(f"npm {name}@{ver}: version not found")
        repo = v.get("repository") or meta.get("repository") or {}
        if isinstance(repo, str):
            repo = {"url": repo}
        dist = v.get("dist") or {}
        return {"eco": "npm", "name": name, "version": ver, "tarball": dist.get("tarball"),
                "integrity": dist.get("integrity"), "attestations": bool(dist.get("attestations")),
                "repo": _norm_repo(repo.get("url")), "subdir": repo.get("directory"),
                "scripts": v.get("scripts") or {}, "license": v.get("license"),
                "time": (meta.get("time") or {}).get(ver), "versions": list((meta.get("versions") or {}).keys()),
                "maintainers": sorted({(m.get("name") or m.get("email") or "?") for m in (v.get("maintainers") or [])
                                       if isinstance(m, dict)}),
                "publisher": (v.get("_npmUser") or {}).get("name") if isinstance(v.get("_npmUser"), dict) else None}
    if eco == "pypi":
        meta = pypi_meta(name, version)
        info = meta.get("info") or {}
        ver = info.get("version")
        urls = meta.get("urls") or []
        sdist = next((u for u in urls if u.get("packagetype") == "sdist"), None)
        wheel = next((u for u in urls if u.get("packagetype") == "bdist_wheel"), None)
        pick = sdist or wheel
        purls = info.get("project_urls") or {}
        repo = None
        for k in ("Source", "Source Code", "Repository", "Code", "GitHub", "Homepage", "homepage"):
            if purls.get(k) and "github.com" in purls[k]:
                repo = purls[k]
                break
        return {"eco": "pypi", "name": name, "version": ver, "tarball": pick and pick.get("url"),
                "kind": pick and pick.get("packagetype"), "sha256": pick and (pick.get("digests") or {}).get("sha256"),
                "repo": _norm_repo(repo), "subdir": None,
                "license": info.get("license_expression") or info.get("license"),
                "classifiers": info.get("classifiers") or [], "requires_dist": info.get("requires_dist") or [],
                "attestations": False, "time": pick and pick.get("upload_time_iso_8601"),
                "maintainers": sorted({x for x in (info.get("author"), info.get("maintainer")) if x}), "publisher": None}
    raise FetchError(f"unsupported ecosystem: {eco}")


def _safe_rel(name):
    name = name.replace("\\", "/")
    rel = posixpath.normpath(name).lstrip("/")
    if rel.startswith("../") or rel == ".." or rel in ("", "."):
        return None
    return rel


def extract(data, dest, kind="tgz"):
    """Extract regular files only; no symlinks/devices/absolute or parent paths."""
    os.makedirs(dest, exist_ok=True)
    total = count = 0

    def write(rel, payload):
        nonlocal total, count
        count += 1
        total += len(payload)
        if count > MAX_FILES or total > MAX_TOTAL:
            raise FetchError("archive too large")
        out = os.path.join(dest, rel)
        if not os.path.abspath(out).startswith(os.path.abspath(dest) + os.sep):
            return
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as fh:
            fh.write(payload)

    if kind == "whl" or data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for zi in z.infolist():
                if zi.is_dir() or zi.file_size > MAX_FILE:
                    continue
                rel = _safe_rel(zi.filename)
                if rel:
                    write(rel, z.read(zi))
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as t:
            for m in t:
                if not m.isreg() or m.size > MAX_FILE:
                    continue
                rel = _safe_rel(m.name)
                if not rel:
                    continue
                f = t.extractfile(m)
                if f:
                    write(rel, f.read())
    # npm tarballs wrap everything in "package/"; sdists in "<name>-<ver>/"
    entries = os.listdir(dest)
    if len(entries) == 1 and os.path.isdir(os.path.join(dest, entries[0])):
        return os.path.join(dest, entries[0])
    return dest


def fetch_extract(info, dest):
    if not info.get("tarball"):
        raise FetchError(f"{info.get('name')}@{info.get('version')}: no downloadable archive")
    data = _get(info["tarball"])
    kind = "whl" if str(info["tarball"]).endswith(".whl") else "tgz"
    return extract(data, dest, kind)
