/* Atlas Allowlist Builder demo engine (offline, dependency-free).
 *
 * Faithful JS port of the launch-config checks in atlas/allowlist/allowlist_core.py
 * (config_findings, check_url, derive_packages, ...) plus the "any"/"text"-scope regex
 * rules of atlas/scanner/scan.py that config_findings applies to the joined command line.
 *
 * It never makes network calls and never executes what it evaluates.
 * Wording rule: findings are reported as 「パターンを検出」 / "pattern detected".
 */
(function (root) {
  'use strict';

  // -------------------------------------------------------------------------
  // Rule tables (IDs identical to the Python implementation)
  // -------------------------------------------------------------------------
  var SEV_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  var REC_ORDER = { approve: 0, review: 1, deny: 2 };
  var REC_LABEL = { approve: '承認推奨', review: '要レビュー', deny: '拒否推奨' };

  var CONFIG_RULES = {
    'ATL-UP-001': ['medium', 'Floating version in launch config (unpinned / @latest / :latest)',
      '起動設定でバージョンが固定されていない'],
    'ATL-PL-002': ['high', 'Launch config pulls a git source on a mutable ref (no commit sha)',
      '起動設定がコミット SHA で固定されていない git ソースを取得する'],
    'ATL-CR-003': ['high', 'Inline secret in launch config (redacted)',
      '起動設定に秘密情報が直書きされている（伏せ字済み）'],
    'ATL-CR-005': ['medium', 'Possible inline credential in env/header (literal value, redacted)',
      'env / ヘッダーに認証情報らしき値が直書きされている（伏せ字済み）'],
    'ATL-CE-005': ['medium', 'Server launched through a shell wrapper (bash -c / sh -c)',
      'シェル経由でサーバーを起動している（bash -c / sh -c）'],
    'ATL-NW-006': ['high', 'Remote server over plain http:// to a non-localhost host',
      'localhost 以外のホストへ平文の http:// で接続する'],
    'ATL-NW-007': ['high', 'Remote server on an ephemeral tunnel host',
      '一時的なトンネルサービスのホストに接続する'],
    'ATL-NW-008': ['medium', 'Remote server addressed by raw IP',
      'リモートサーバーを IP アドレスで直接指定している'],
    'ATL-PM-004': ['high', 'Container launched with host-level privileges (--privileged / host root mount / host network)',
      'ホスト権限付きでコンテナを起動する（--privileged / ホストのルートのマウント / host ネットワーク）']
  };

  // scan.py rules with scope "any" or "text" (applied to the joined command line)
  var SENS_PATH = "(~|\\$HOME|%USERPROFILE%|homedir\\(\\))[/\\\\]?\\.?(ssh|aws|gnupg|cursor[/\\\\]mcp\\.json|claude\\.json|docker[/\\\\]config\\.json|kube[/\\\\]config|npmrc|pypirc|netrc|git-credentials)" +
    "|\\bid_(rsa|ed25519|ecdsa)\\b|\\.aws[/\\\\]credentials|\\bwallet\\.dat\\b|Login Data|\\.config[/\\\\]gh[/\\\\]hosts\\.yml";
  var SCAN_RULES = [
    { id: 'ATL-TP-001', sev: 'high', scope: 'any', re: /<\s*\/?\s*(IMPORTANT|SYSTEM|INSTRUCTIONS?|HIDDEN|SECRET|ADMIN|OVERRIDE)\s*>/,
      title: 'Pseudo-XML instruction tag (<IMPORTANT>, <SYSTEM> ...) typical of tool poisoning',
      titleJa: '疑似 XML の指示タグ（<IMPORTANT> / <SYSTEM> など）' },
    { id: 'ATL-TP-002', sev: 'high', scope: 'any',
      re: /\b(do\s+not|don'?t|never)\s+(tell|inform|mention|notify|alert|reveal|show)\s+(this\s+)?(to\s+)?(the\s+)?(user|human)\b/i,
      title: 'Concealment instruction (hide behaviour from the user)', titleJa: 'ユーザーに動作を伏せるよう求める指示' },
    { id: 'ATL-TP-003', sev: 'high', scope: 'any',
      re: /\b(ignore|disregard|forget|override)\s+(all\s+)?(the\s+)?(previous|prior|above|earlier|system|other)\s+(instructions?|prompts?|rules|guidelines|tools?)\b/i,
      title: 'Instruction-override phrase', titleJa: '既存の指示を無視させる文言' },
    { id: 'ATL-TP-004', sev: 'high', scope: 'any',
      re: new RegExp("\\b(read|cat|open|send|pass|upload|include|copy|attach|provide|extract)\\b[^\\n]{0,80}(" + SENS_PATH + ")", 'i'),
      title: 'Instruction/code that reads or passes a credential / agent-config file',
      titleJa: '認証情報・エージェント設定ファイルを読み取る／渡す指示' },
    { id: 'ATL-TP-005', sev: 'medium', scope: 'any',
      re: /\b(before|prior\s+to)\s+(using|calling|invoking|running)\s+(this|any\s+other)\s+tool\b.{0,80}\b(read|send|pass|include|call)\b/i,
      title: 'Coercive tool-ordering instruction (shadowing pattern)', titleJa: 'ツールの呼び出し順を強制する指示' },
    { id: 'ATL-OB-001', sev: 'high', scope: 'any',
      re: /[\u200b\u2060\u202a-\u202e\u2066-\u2069]|(?<=.)\ufeff|(?<=[A-Za-z0-9 ])[\u200c\u200d](?=[A-Za-z0-9 ])/,
      title: 'Zero-width / bidi control character', titleJa: 'ゼロ幅文字・双方向制御文字' },
    { id: 'ATL-OB-002', sev: 'critical', scope: 'any', re: /[\u{E0000}-\u{E007F}]/u,
      title: 'Unicode TAG character (invisible ASCII smuggling)', titleJa: 'Unicode TAG 文字（不可視の文字列埋め込み）' },
    { id: 'ATL-RF-001', sev: 'critical', scope: 'any',
      re: /\b(curl|wget)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z)?sh\b|\b(iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^\n|]{0,200}\|\s*(iex|Invoke-Expression)\b|\bsh\s+-c\s+"?\$\((curl|wget)/i,
      title: 'Pipe-to-shell remote script (curl | sh)', titleJa: 'リモートのスクリプトをシェルへパイプして実行（curl | sh）' },
    { id: 'ATL-NW-002', sev: 'high', scope: 'any',
      re: /webhook\.site|\brequestbin\b|pipedream\.net|\.ngrok(-free)?\.(io|app)|\binteract\.sh\b|\boast\.(fun|me|pro|live)\b|burpcollaborator|discord(app)?\.com\/api\/webhooks|api\.telegram\.org\/bot|\btransfer\.sh\b|pastebin\.com\/raw|\bhookbin\b/i,
      title: 'Known exfiltration / callback endpoint', titleJa: '既知の外部送信・コールバック用エンドポイント' },
    { id: 'ATL-SK-001', sev: 'high', scope: 'text',
      re: /--dangerously-skip-permissions|"?defaultMode"?\s*:\s*"?bypassPermissions|--yolo\b|disable\s+(the\s+)?(sandbox|safety|guardrails?|permission\s+prompts?)|without\s+asking\s+(the\s+user\s+)?for\s+(permission|confirmation)|auto[- ]?approve\s+all/i,
      title: 'Instruction to disable agent safety / permissions', titleJa: 'エージェントの安全機能・権限確認を無効化する指示' }
  ];
  var SCAN_BY_ID = {};
  SCAN_RULES.forEach(function (r) { SCAN_BY_ID[r.id] = r; });

  function ruleMeta(rid) {
    if (CONFIG_RULES[rid]) return { sev: CONFIG_RULES[rid][0], title: CONFIG_RULES[rid][1], titleJa: CONFIG_RULES[rid][2] };
    if (SCAN_BY_ID[rid]) return { sev: SCAN_BY_ID[rid].sev, title: SCAN_BY_ID[rid].title, titleJa: SCAN_BY_ID[rid].titleJa };
    return { sev: 'medium', title: rid, titleJa: rid };
  }

  var SECRET_SRC = [
    'AKIA[0-9A-Z]{16}',
    '\\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}',
    '\\bgithub_pat_[A-Za-z0-9_]{20,}',
    '\\bsk-ant-[A-Za-z0-9_\\-]{10,}',
    '\\bsk-(?:proj-)?[A-Za-z0-9]{32,}',
    '\\bxox[abprs]-[A-Za-z0-9\\-]{10,}',
    '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    '\\bglpat-[A-Za-z0-9_\\-]{20,}'
  ];
  var SECRET_RES = SECRET_SRC.map(function (s) { return new RegExp(s); });
  var CRED_KEY_RE = /(TOKEN|SECRET|PASSW(OR)?D|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|AUTH)/i;
  var TUNNEL_SUFFIXES = ['trycloudflare.com', 'ngrok.io', 'ngrok-free.app', 'ngrok.app', 'ngrok-free.dev',
    'ngrok.dev', 'loca.lt', 'localtunnel.me', 'serveo.net', 'serveousercontent.com',
    'localhost.run', 'lhr.life', 'pinggy.io', 'pinggy.link', 'pinggy.online',
    'bore.pub', 'devtunnels.ms', 'tunnelmole.net', 'telebit.io', 'localto.net'];
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];
  var SHELLS = ['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish'];
  var WIN_SHELLS = ['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'];
  var DOCKER_VALUE_OPTS = ['-e', '--env', '-v', '--volume', '--name', '-p', '--publish', '--network', '--net',
    '-w', '--workdir', '-u', '--user', '--entrypoint', '--mount', '--env-file', '-l',
    '--label', '--platform', '--pull', '-h', '--hostname', '--add-host', '--cap-add',
    '--cap-drop', '--device', '-m', '--memory', '--cpus', '--restart', '--security-opt',
    '--tmpfs', '--ulimit', '--ipc', '--pid', '--gpus', '--runtime', '--log-driver'];

  function inArr(a, x) { return a.indexOf(x) !== -1; }
  function str(v) {
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function truthy(v) {
    if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  // -------------------------------------------------------------------------
  // Secrets
  // -------------------------------------------------------------------------
  // credential-named URL query params (?token=...) and flag values (--password xyz / --api-key=xyz)
  var QUERY_CRED_SRC = '([?&][^=&#\\s"]*?(?:token|secret|passw(?:or)?d|api[_-]?key|access[_-]?key|auth|credential|sig(?:nature)?)[^=&#\\s"]*=)([^&#\\s"]+)';
  var FLAG_CRED_SRC = '((?:^|\\s)--?[A-Za-z0-9-]*(?:password|passwd|token|secret|api-?key|apikey|access-?key)(?:=|\\s+))([^\\s"]+)';
  var FLAG_CRED_RE = /^--?[A-Za-z0-9-]*(?:password|passwd|token|secret|api-?key|apikey|access-?key)$/i;
  function isPlaceholder(v) { return /^\$\{[^}]+\}$/.test(v) || /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(v); }
  function redact(s) {
    s = str(s);
    SECRET_SRC.forEach(function (src) {
      s = s.replace(new RegExp(src, 'g'), function (m) { return m.slice(0, 4) + '…[REDACTED]'; });
    });
    s = s.replace(new RegExp(QUERY_CRED_SRC, 'gi'), function (m, p, v) { return isPlaceholder(v) ? m : p + '[REDACTED]'; });
    s = s.replace(new RegExp(FLAG_CRED_SRC, 'gi'), function (m, p, v) { return isPlaceholder(v) ? m : p + '[REDACTED]'; });
    return s;
  }
  function subQueryCreds(u, ph) {
    return str(u).replace(new RegExp(QUERY_CRED_SRC, 'gi'), function (m, p, v) { return isPlaceholder(v) ? m : p + ph; });
  }
  function hasSecret(s) {
    s = str(s);
    return SECRET_RES.some(function (r) { return r.test(s); });
  }
  function subSecrets(s, ph) {
    SECRET_SRC.forEach(function (src) {
      s = s.replace(new RegExp(src, 'g'), function () { return ph; });
    });
    if (ph.indexOf('-----BEGIN') !== -1 || s.indexOf('PRIVATE KEY') !== -1) {
      s = s.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, function () { return ph; });
    }
    return s;
  }
  function literalCred(v) {
    v = v.trim();
    if (v.length < 8 || v.replace('Bearer ', '').replace('Basic ', '').replace('Token ', '').indexOf(' ') !== -1) return false;
    var pfx = ['${', '$', 'http://', 'https://', '/', '~', '.', '<', '{env:', '{{'];
    for (var i = 0; i < pfx.length; i++) if (v.indexOf(pfx[i]) === 0) return false;
    if (inArr(['true', 'false', 'changeme', 'your-api-key', 'your_api_key', 'xxxxxxxx'], v.toLowerCase())) return false;
    return true;
  }

  // -------------------------------------------------------------------------
  // argv / packages
  // -------------------------------------------------------------------------
  // POSIX shlex.split (quotes, backslash escapes, # comments are not stripped: shlex.split default comments=False)
  function shlexSplit(s) {
    var out = [], cur = '', has = false, i = 0, q = null;
    while (i < s.length) {
      var c = s[i];
      if (q === "'") {
        if (c === "'") q = null; else cur += c;
      } else if (q === '"') {
        if (c === '"') q = null;
        else if (c === '\\' && i + 1 < s.length && '\\"$`\n'.indexOf(s[i + 1]) !== -1) { cur += s[i + 1]; i++; }
        else cur += c;
      } else if (/\s/.test(c)) {
        if (has) { out.push(cur); cur = ''; has = false; }
      } else if (c === "'" || c === '"') { q = c; has = true; }
      else if (c === '\\') {
        if (i + 1 >= s.length) throw new Error('No escaped character');
        cur += s[i + 1]; i++; has = true;
      } else { cur += c; has = true; }
      i++;
    }
    if (q) throw new Error('No closing quotation');
    if (has) out.push(cur);
    return out;
  }

  function argvOf(cfg) {
    var cmd = cfg.command;
    if (!truthy(cmd)) return [];
    var args = truthy(cfg.args) ? cfg.args : [];
    if (!Array.isArray(args)) args = [str(args)];
    var argv = [str(cmd)].concat(args.map(str));
    if (!args.length && str(cmd).trim().indexOf(' ') !== -1) {
      try { argv = shlexSplit(str(cmd)); } catch (e) { argv = str(cmd).trim().split(/\s+/); }
    }
    return argv;
  }
  function base(cmd) { var p = str(cmd).split('/'); return p[p.length - 1].toLowerCase(); }

  var NPM_EXACT = /^v?\d+\.\d+\.\d+(?:[-+][\w.\-]+)?$/;

  function parseNpmSpec(spec) {
    if (/^(git\+|git:|github:|gitlab:|bitbucket:)/.test(spec) || /^[\w.\-]+\/[\w.\-]+(#.*)?$/.test(spec)) return [spec, null, 'git'];
    if (/^https?:\/\//.test(spec)) return [spec, null, 'url'];
    if (/^(\.|\/|~|file:)/.test(spec)) return [spec, null, 'path'];
    var at = spec.lastIndexOf('@');
    if (at > 0) return [spec.slice(0, at), spec.slice(at + 1), 'registry'];
    return [spec, null, 'registry'];
  }
  function parsePypiSpec(spec) {
    if (spec.indexOf('git+') === 0 || /^https?:\/\//.test(spec)) return [spec, null, spec.indexOf('git+') === 0 ? 'git' : 'url'];
    if (/^(\.|\/|~)/.test(spec)) return [spec, null, 'path'];
    var m = /^([A-Za-z0-9][A-Za-z0-9._\-]*)(?:\[[^\]]*\])?\s*(==|@|>=|~=|<=|>|<|!=)?\s*(.*)$/.exec(spec);
    if (!m) return [spec, null, 'registry'];
    var name = m[1], op = m[2], ver = (m[3] || '').trim();
    if ((op === '==' || op === '@') && ver && ver !== 'latest' && ver.slice(-1) !== '*') return [name, ver, 'registry'];
    return [name, op ? op + ver : null, 'registry'];
  }
  function gitRefPinned(spec) { return /[#@]([0-9a-f]{40})\b/.test(spec); }

  function firstIs(arr, vals) { return arr.length > 0 && inArr(vals, arr[0]); }

  function derivePackages(argv) {
    if (!argv || !argv.length) return [];
    var b = base(argv[0]);
    var rest = argv.slice(1);
    if ((b === 'cmd' || b === 'cmd.exe') && rest.length && inArr(['/c', '/k'], rest[0].toLowerCase())) return derivePackages(rest.slice(1));
    var pkgs = [];
    function npm(spec) {
      var r = parseNpmSpec(spec), pinned;
      if (r[2] === 'git') pinned = gitRefPinned(spec);
      else if (r[2] === 'registry') pinned = !!(r[1] && NPM_EXACT.test(r[1]));
      else pinned = false;
      pkgs.push({ eco: 'npm', name: r[0], version: r[1], pinned: pinned, kind: r[2], raw: spec });
    }
    function pypi(spec) {
      var r = parsePypiSpec(spec), pinned;
      if (r[2] === 'git') pinned = gitRefPinned(spec);
      else pinned = !!(r[2] === 'registry' && r[1] && !/^[<>~!]/.test(r[1]));
      pkgs.push({ eco: 'pypi', name: r[0], version: r[1], pinned: pinned, kind: r[2], raw: spec });
    }
    var i, a, firstPos;
    if (b === 'npx' || b === 'bunx' || (inArr(['pnpm', 'yarn', 'bun'], b) && firstIs(rest, ['dlx', 'x'])) || (b === 'npm' && firstIs(rest, ['exec', 'x']))) {
      if (inArr(['pnpm', 'yarn', 'bun', 'npm'], b)) rest = rest.slice(1);
      var explicit = [];
      i = 0; firstPos = null;
      while (i < rest.length) {
        a = rest[i];
        if (a === '-p' || a === '--package') {
          if (i + 1 < rest.length) explicit.push(rest[i + 1]);
          i += 2; continue;
        }
        if (a.indexOf('--package=') === 0) explicit.push(a.split('=').slice(1).join('='));
        else if (a === '--') {
          i += 1;
          if (firstPos === null && i < rest.length) firstPos = rest[i];
          break;
        } else if (a[0] !== '-') { firstPos = a; break; }
        i += 1;
      }
      (explicit.length ? explicit : (firstPos ? [firstPos] : [])).forEach(npm);
    } else if (b === 'uvx' || (b === 'uv' && rest[0] === 'tool' && rest[1] === 'run') || (b === 'pipx' && rest[0] === 'run')) {
      if (b === 'uv') rest = rest.slice(2); else if (b === 'pipx') rest = rest.slice(1);
      var frm = null; firstPos = null; i = 0;
      while (i < rest.length) {
        a = rest[i];
        if (a === '--from' || a === '--spec') { frm = i + 1 < rest.length ? rest[i + 1] : null; i += 2; continue; }
        if (a.indexOf('--from=') === 0 || a.indexOf('--spec=') === 0) frm = a.split('=').slice(1).join('=');
        else if (inArr(['--with', '-w', '--python', '-p', '--index-url', '--index', '--extra-index-url', '--pip-args'], a)) { i += 2; continue; }
        else if (a[0] !== '-') { firstPos = a; break; }
        i += 1;
      }
      if (frm || firstPos) pypi(frm || firstPos);
    } else if ((inArr(['docker', 'podman', 'nerdctl'], b) && rest[0] === 'run') || (inArr(['docker', 'podman'], b) && rest[0] === 'container' && rest[1] === 'run')) {
      rest = rest[0] === 'container' ? rest.slice(2) : rest.slice(1);
      i = 0;
      while (i < rest.length) {
        a = rest[i];
        if (inArr(DOCKER_VALUE_OPTS, a)) { i += 2; continue; }
        if (a[0] === '-') { i += 1; continue; }
        var image = a, digest = image.indexOf('@sha256:') !== -1, tag = null;
        var parts = image.split('/'), last = parts[parts.length - 1];
        if (!digest && last.indexOf(':') !== -1) tag = last.slice(last.lastIndexOf(':') + 1);
        var name = image.split('@')[0];
        if (tag) name = name.slice(0, name.length - (tag.length + 1));
        pkgs.push({ eco: 'oci', name: name, version: digest ? 'digest' : tag,
          pinned: digest || (tag !== null && tag !== 'latest'), kind: 'registry', raw: image });
        break;
      }
    }
    return pkgs;
  }

  function dockerPrivileges(argv) {
    var hits = [];
    if (!argv.length || !inArr(['docker', 'podman', 'nerdctl'], base(argv[0]))) return hits;
    argv.forEach(function (a, i) {
      if (a === '--privileged') hits.push(a);
      if ((a === '--network' || a === '--net') && i + 1 < argv.length && argv[i + 1] === 'host') hits.push(a + ' host');
      if (inArr(['--network=host', '--net=host', '--pid=host'], a)) hits.push(a);
      if ((a === '-v' || a === '--volume') && i + 1 < argv.length && /^\/(:|$)|^\/var\/run\/docker\.sock/.test(argv[i + 1])) hits.push(a + ' ' + argv[i + 1]);
    });
    return hits;
  }

  // -------------------------------------------------------------------------
  // URLs
  // -------------------------------------------------------------------------
  function urlSplit(u) {
    var m = /^([A-Za-z][A-Za-z0-9+.\-]*):(.*)$/.exec(u);
    var scheme = '', rest = u;
    if (m) { scheme = m[1].toLowerCase(); rest = m[2]; }
    var netloc = '';
    if (rest.indexOf('//') === 0) {
      var r2 = rest.slice(2), end = r2.search(/[\/?#]/);
      netloc = end === -1 ? r2 : r2.slice(0, end);
    }
    if ((netloc.indexOf('[') !== -1) !== (netloc.indexOf(']') !== -1)) throw new Error('Invalid IPv6 URL');
    var hp = netloc.slice(netloc.lastIndexOf('@') + 1), host;
    var bm = /^\[([^\]]*)\]/.exec(hp);
    if (bm) {
      host = bm[1];
      if (!parseIPv6(host.split('%')[0])) throw new Error('Invalid IPv6 URL');
    } else host = hp.split(':')[0];
    return { scheme: scheme, hostname: host.toLowerCase() };
  }

  function parseIPv4(s) {
    var p = s.split('.');
    if (p.length !== 4) return null;
    var out = [];
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(p[i]) || (p[i].length > 1 && p[i][0] === '0')) return null;
      var n = parseInt(p[i], 10);
      if (n > 255) return null;
      out.push(n);
    }
    return out;
  }
  function parseIPv6(s) {
    if (!/^[0-9a-fA-F:.]+$/.test(s) || s.indexOf(':') === -1) return null;
    var lastColon = s.lastIndexOf(':');
    var lastPart = s.slice(lastColon + 1);
    if (lastPart.indexOf('.') !== -1) {
      var v4 = parseIPv4(lastPart);
      if (!v4) return null;
      s = s.slice(0, lastColon + 1) + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16);
    }
    var dbl = s.split('::');
    if (dbl.length > 2) return null;
    function hx(part) {
      if (part === '') return [];
      return part.split(':').map(function (h) { return /^[0-9a-fA-F]{1,4}$/.test(h) ? parseInt(h, 16) : NaN; });
    }
    var head = hx(dbl[0]), back = dbl.length === 2 ? hx(dbl[1]) : [];
    var groups;
    var need = 8;
    if (dbl.length === 2) {
      var fill = need - head.length - back.length;
      if (fill < 1) return null;
      groups = head.concat(new Array(fill).fill(0), back);
    } else groups = head;
    if (groups.length !== 8 || groups.some(function (g) { return isNaN(g); })) return null;
    return groups;
  }
  function inV4(ip, net, bits) {
    var a = ((ip[0] << 24) >>> 0) + (ip[1] << 16) + (ip[2] << 8) + ip[3];
    var n = net.split('.').map(Number);
    var b = ((n[0] << 24) >>> 0) + (n[1] << 16) + (n[2] << 8) + n[3];
    var mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((a & mask) >>> 0) === ((b & mask) >>> 0);
  }
  var V4_PRIVATE = [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 29], ['192.0.0.170', 31], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['240.0.0.0', 4], ['255.255.255.255', 32]];
  // -> {loopback, private} or null when not an IP literal
  function ipInfo(host) {
    var v4 = parseIPv4(host);
    if (v4) {
      var priv = V4_PRIVATE.some(function (r) { return inV4(v4, r[0], r[1]); }) &&
        !(inV4(v4, '192.0.0.9', 32) || inV4(v4, '192.0.0.10', 32));
      return { loopback: v4[0] === 127, private: priv };
    }
    var v6 = parseIPv6(host);
    if (v6) {
      var isLoop = v6.slice(0, 7).every(function (g) { return g === 0; }) && v6[7] === 1;
      var mapped = v6.slice(0, 5).every(function (g) { return g === 0; }) && v6[5] === 0xffff;
      if (mapped) {
        var m4 = [v6[6] >> 8, v6[6] & 255, v6[7] >> 8, v6[7] & 255];
        var inf = ipInfo(m4.join('.'));
        return { loopback: inf.loopback, private: inf.private };
      }
      var unspec = v6.every(function (g) { return g === 0; });
      var p = isLoop || unspec || (v6[0] & 0xfe00) === 0xfc00 || (v6[0] & 0xffc0) === 0xfe80 ||
        (v6[0] === 0x2001 && v6[1] === 0x0db8) || (v6[0] === 0x2001 && v6[1] < 0x200) || v6[0] === 0x2002 ||
        (v6[0] === 0x100 && v6[1] === 0 && v6[2] === 0 && v6[3] === 0) || (v6[0] === 0x64 && v6[1] === 0xff9b && v6[2] === 1);
      return { loopback: isLoop, private: p };
    }
    return null;
  }

  function checkUrl(u) {
    var out = [], p;
    try { p = urlSplit(u); } catch (e) { return [['ATL-NW-008', 'unparseable URL']]; }
    var host = p.hostname.replace(/\.+$/, '');
    var local = inArr(LOCAL_HOSTS, host);
    if (p.scheme === 'http' && !local) out.push(['ATL-NW-006', 'plain http to ' + host]);
    if (TUNNEL_SUFFIXES.some(function (s) { return host === s || host.slice(-(s.length + 1)) === '.' + s; })) out.push(['ATL-NW-007', 'tunnel host ' + host]);
    var ip = ipInfo(host.replace(/^\[+|\]+$/g, ''));
    if (ip && !ip.loopback) out.push(['ATL-NW-008', 'raw IP ' + host + (ip.private ? ' (non-public range)' : '')]);
    return out;
  }

  // -------------------------------------------------------------------------
  // config_findings
  // -------------------------------------------------------------------------
  function lineOf(raw, needle, after) {
    if (!raw || !needle) return 0;
    var lines = raw.split(/\r\n|\r|\n/);
    var enc = JSON.stringify(String(needle)).slice(1, -1);
    for (var i = after || 0; i < lines.length; i++) {
      if (lines[i].indexOf(needle) !== -1 || lines[i].indexOf(enc) !== -1) return i + 1;
    }
    return 0;
  }

  function configFindings(name, cfg, key, raw) {
    key = key || 'mcpServers';
    var findings = [];
    var san = clone(cfg);
    var basePtr = '#/' + key.replace(/\./g, '/') + '/' + name;
    var start = Math.max(0, lineOf(raw, '"' + name + '"') - 1);
    var notes = [];

    function add(rid, ptr, value, note, sev, hint) {
      var meta = ruleMeta(rid);
      var v = str(value);
      findings.push({
        rule: rid, sev: sev || meta.sev, title: meta.title, titleJa: meta.titleJa,
        ptr: basePtr + '/' + ptr,
        line: lineOf(raw, hint || (!hasSecret(v) ? v.slice(0, 40) : v.slice(0, 4)), start),
        snippet: redact(v).slice(0, 160), note: note || null, source: 'config'
      });
    }

    var argv = argvOf(cfg);
    var cmdline = argv.join(' ');
    // 1. scanner regex rules (any/text scope) over the joined command line
    if (cmdline) {
      SCAN_RULES.forEach(function (r) {
        if ((r.scope === 'any' || r.scope === 'text') && r.re.test(cmdline)) {
          findings.push({ rule: r.id, sev: r.sev, title: r.title, titleJa: r.titleJa, ptr: basePtr + '/args',
            line: lineOf(raw, argv[argv.length - 1].slice(0, 40), start), snippet: redact(cmdline).slice(0, 200),
            note: null, source: 'config' });
        }
      });
    }
    // 2. shell wrapper
    if (argv.length) {
      var b = base(argv[0]);
      if (inArr(SHELLS, b) && argv.slice(1, 3).some(function (a) { return inArr(['-c', '-lc', '-ic'], a); })) {
        add('ATL-CE-005', 'command', cmdline, null, null, argv[argv.length - 1].slice(0, 40));
      } else if (inArr(WIN_SHELLS, b) && argv.length > 1 && inArr(['/c', '/k', '-command', '-c', '-encodedcommand', '-enc'], argv[1].toLowerCase())) {
        var inner = derivePackages(argv);
        if (inArr(['-encodedcommand', '-enc'], argv[1].toLowerCase())) add('ATL-CE-005', 'command', cmdline, 'encoded PowerShell', 'high');
        else if (!inner.length) add('ATL-CE-005', 'command', cmdline, null, 'low');
      }
    }
    // 3. packages / floating versions / mutable refs
    var pkgs = derivePackages(argv);
    pkgs.forEach(function (p) {
      if (p.kind === 'git' && !p.pinned) add('ATL-PL-002', 'args', p.raw, p.eco + ' git source without commit sha');
      else if ((p.kind === 'registry' || p.kind === 'url') && !p.pinned) {
        var why = !p.version ? 'no version' : "floating '" + p.version + "'";
        add('ATL-UP-001', 'args', p.raw, p.eco + ' ' + why);
      }
    });
    dockerPrivileges(argv).forEach(function (h) { add('ATL-PM-004', 'args', h); });
    // 4. remote URLs
    var urls = [];
    if (truthy(cfg.url)) urls.push(['url', str(cfg.url)]);
    argv.slice(1).forEach(function (a) { if (/^https?:\/\//.test(a)) urls.push(['args', a]); });
    urls.forEach(function (pu) {
      checkUrl(pu[1]).forEach(function (rn) { add(rn[0], pu[0], pu[1], rn[1]); });
      if (pu[0] === 'url' && SCAN_BY_ID['ATL-NW-002'].re.test(pu[1]) &&
        !findings.some(function (f) { return f.rule === 'ATL-NW-007'; })) add('ATL-NW-002', pu[0], pu[1], null, 'high');
    });
    // 5. inline secrets -> finding + ${VAR} placeholder in the sanitized copy
    var secN = 0;
    function placeholder(hint) {
      secN += 1;
      hint = hint.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase() || 'SECRET';
      return '${' + (secN === 1 || hint !== 'SECRET' ? hint : hint + '_' + secN) + '}';
    }
    ['env', 'headers'].forEach(function (sect) {
      var d = cfg[sect];
      if (!isObj(d)) return;
      Object.keys(d).forEach(function (k) {
        var v = str(d[k]);
        if (hasSecret(v)) {
          add('ATL-CR-003', sect + '/' + k, k + '=' + v);
          san[sect][k] = subSecrets(v, placeholder(sect === 'env' ? k : 'ATLAS_' + k));
        } else if (CRED_KEY_RE.test(k) && literalCred(v)) {
          add('ATL-CR-005', sect + '/' + k, k + '=' + v.slice(0, 4) + '…[REDACTED]');
          var pfx = '';
          if (sect === 'headers' && /^(Bearer|Basic|Token)\s+/i.test(v)) pfx = v.trim().split(/\s+/)[0] + ' ';
          san[sect][k] = pfx + placeholder(sect === 'env' ? k : 'ATLAS_' + k);
        }
      });
    });
    if (Array.isArray(cfg.args)) {
      cfg.args.forEach(function (a, i) {
        if (hasSecret(a)) {
          add('ATL-CR-003', 'args/' + i, a);
          san.args[i] = subSecrets(str(a), placeholder('ATLAS_SECRET'));
        } else if (i > 0 && FLAG_CRED_RE.test(str(cfg.args[i - 1])) && literalCred(str(a)) && !isPlaceholder(str(a))) {
          // demo addition: positional credential after a --password / --token style flag
          add('ATL-CR-005', 'args/' + i, str(cfg.args[i - 1]) + ' ' + str(a).slice(0, 4) + '…[REDACTED]');
          san.args[i] = placeholder('ATLAS_' + str(cfg.args[i - 1]).replace(/^-+/, ''));
        } else {
          var fm = /^(--?[A-Za-z0-9-]+)=(.+)$/.exec(str(a));
          if (fm && FLAG_CRED_RE.test(fm[1]) && literalCred(fm[2]) && !isPlaceholder(fm[2])) {
            add('ATL-CR-005', 'args/' + i, fm[1] + '=' + fm[2].slice(0, 4) + '…[REDACTED]');
            san.args[i] = fm[1] + '=' + placeholder('ATLAS_' + fm[1].replace(/^-+/, ''));
          }
        }
        // demo addition: credential-named query parameter in a URL argument (mcp-remote https://...?token=...)
        if (typeof san.args[i] === 'string' && /^https?:\/\//.test(san.args[i]) && redact(san.args[i]) !== san.args[i]) {
          add('ATL-CR-005', 'args/' + i, redact(san.args[i]), 'credential in URL query');
          san.args[i] = subQueryCreds(san.args[i], placeholder('ATLAS_URL_TOKEN'));
        }
      });
    }
    if (truthy(cfg.url) && typeof san.url === 'string' && redact(san.url) !== san.url && !hasSecret(san.url)) {
      add('ATL-CR-005', 'url', redact(san.url), 'credential in URL query');
      san.url = subQueryCreds(san.url, placeholder('ATLAS_URL_TOKEN'));
    }
    ['url', 'command'].forEach(function (k) {
      if (truthy(cfg[k]) && hasSecret(cfg[k])) {
        add('ATL-CR-003', k, cfg[k]);
        san[k] = subSecrets(str(cfg[k]), placeholder('ATLAS_SECRET'));
      }
    });
    if (findings.some(function (f) { return f.rule === 'ATL-NW-007'; })) findings = findings.filter(function (f) { return f.rule !== 'ATL-NW-002'; });
    if (findings.some(function (f) { return f.rule === 'ATL-CR-003' || f.rule === 'ATL-CR-005'; })) notes.push('secrets');
    if (/\$\{input:/.test(JSON.stringify(cfg))) notes.push('vscode-input');
    return { findings: findings, sanitized: san, notes: notes, packages: pkgs, urls: urls.map(function (x) { return x[1]; }) };
  }

  // -------------------------------------------------------------------------
  // Parsing (JSON / VS Code JSONC)
  // -------------------------------------------------------------------------
  function stripJsonc(text) {
    var out = '', i = 0, n = text.length, inStr = false;
    while (i < n) {
      var c = text[i];
      if (inStr) {
        out += c;
        if (c === '\\' && i + 1 < n) { out += text[i + 1]; i += 2; continue; }
        if (c === '"') inStr = false;
        i++; continue;
      }
      if (c === '"') { inStr = true; out += c; i++; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
      if (c === '/' && text[i + 1] === '*') {
        var e = text.indexOf('*/', i + 2);
        i = e === -1 ? n : e + 2; out += ' '; continue;
      }
      out += c; i++;
    }
    // trailing commas (outside strings)
    var res = ''; inStr = false;
    for (i = 0; i < out.length; i++) {
      var ch = out[i];
      if (inStr) {
        res += ch;
        if (ch === '\\' && i + 1 < out.length) { res += out[i + 1]; i++; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; res += ch; continue; }
      if (ch === ',') {
        var j = i + 1;
        while (j < out.length && /\s/.test(out[j])) j++;
        if (out[j] === '}' || out[j] === ']') continue;
      }
      res += ch;
    }
    return res;
  }

  function looksLikeServers(o) {
    var ks = Object.keys(o);
    return ks.length > 0 && ks.every(function (k) { return isObj(o[k]) && (o[k].command !== undefined || o[k].url !== undefined); });
  }

  function parseConfig(text) {
    text = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    if (!text.trim()) return { format: null, servers: [], error: '設定が空です。mcpServers または servers を含む JSON を貼り付けてください。' };
    var data, cleaned = stripJsonc(text);
    try { data = JSON.parse(cleaned); } catch (e) {
      try { data = JSON.parse('{' + cleaned.replace(/,\s*$/, '') + '}'); } catch (e2) {
        return { format: null, servers: [], error: 'JSON として読み取れませんでした（' + String(e.message).slice(0, 120) + '）。' };
      }
    }
    if (!isObj(data)) return { format: null, servers: [], error: 'オブジェクト形式の設定（{"mcpServers": {...}} など）を貼り付けてください。' };
    var servers = null, key = null, format = null;
    if (isObj(data.mcpServers)) { servers = data.mcpServers; key = 'mcpServers'; }
    else if (isObj(data.servers)) { servers = data.servers; key = 'servers'; format = 'vscode'; }
    else if (isObj(data.mcp)) {
      if (isObj(data.mcp.servers)) { servers = data.mcp.servers; key = 'mcp.servers'; format = 'vscode'; }
      else if (isObj(data.mcp.mcpServers)) { servers = data.mcp.mcpServers; key = 'mcp.mcpServers'; format = 'vscode'; }
    }
    if (!servers && looksLikeServers(data)) { servers = data; key = 'mcpServers'; }
    if (!servers) return { format: null, servers: [], error: '"mcpServers" または "servers" のオブジェクトが見つかりませんでした。' };
    if (!format) {
      var desktopKeys = ['globalShortcut', 'preferences', 'isUsingBuiltInNodeForMcp', 'dxt', 'extensions'];
      format = Object.keys(data).some(function (k) { return inArr(desktopKeys, k); }) ? 'desktop' : 'claude';
    }
    var list = [];
    Object.keys(servers).forEach(function (n) {
      if (isObj(servers[n])) list.push({ name: String(n), cfg: servers[n], key: key });
    });
    return { format: format, servers: list, key: key, raw: text };
  }

  // -------------------------------------------------------------------------
  // Samples + recommendation
  // -------------------------------------------------------------------------
  function normRepo(u) {
    if (!u) return null;
    var s = String(u).trim().toLowerCase();
    s = s.replace(/^git\+/, '').replace(/^github:/, 'https://github.com/').replace(/^git@github\.com:/, 'https://github.com/');
    var m = /github\.com[\/:]([\w.\-]+)\/([\w.\-]+)/.exec(s);
    if (!m) return null;
    return 'github.com/' + m[1] + '/' + m[2].replace(/\.git$/, '');
  }
  function serverRepos(pkgs, urls, argv) {
    var out = [];
    pkgs.forEach(function (p) {
      if (p.kind === 'git' || p.kind === 'url') {
        var r = normRepo(p.raw) || (/^[\w.\-]+\/[\w.\-]+(#.*)?$/.test(p.raw) ? normRepo('github.com/' + p.raw.split('#')[0]) : null);
        if (r) out.push(r);
      }
    });
    urls.concat(argv).forEach(function (u) { var r = normRepo(u); if (r) out.push(r); });
    return out;
  }
  function matchSample(samples, pkgs, repos) {
    if (!samples || !samples.length) return null;
    for (var i = 0; i < pkgs.length; i++) {
      var p = pkgs[i];
      if (p.kind !== 'registry') continue;
      for (var j = 0; j < samples.length; j++) {
        var sp = samples[j].packages || [];
        for (var k = 0; k < sp.length; k++) {
          if (String(sp[k].eco).toLowerCase() === p.eco && String(sp[k].name).toLowerCase() === String(p.name).toLowerCase()) return samples[j];
        }
      }
    }
    for (var a = 0; a < repos.length; a++) {
      for (var b = 0; b < samples.length; b++) {
        if (samples[b].repo && normRepo(samples[b].repo) === repos[a]) return samples[b];
      }
    }
    return null;
  }

  function evidenceOf(f) {
    return f.note ? f.note : f.snippet.slice(0, 80);
  }
  function findingReason(f) {
    return f.rule + '：' + f.titleJa + '（' + evidenceOf(f) + '）パターンを検出';
  }
  var APPROVE_REASON = '起動設定ルールではパターンを検出しませんでした（コードの検査データはこのデモに含まれていません）';

  function recommendItem(findings, notes, sample) {
    var sorted = findings.slice().sort(function (x, y) { return (SEV_ORDER[y.sev] || 0) - (SEV_ORDER[x.sev] || 0) || (x.rule < y.rule ? -1 : x.rule > y.rule ? 1 : 0); });
    var maxSev = sorted.length ? sorted[0].sev : null;
    var cfgRec = maxSev === 'critical' ? 'deny' : (maxSev === 'high' || maxSev === 'medium') ? 'review' : 'approve';
    var reasons = [];
    var rec = cfgRec;
    if (sample) {
      var srec = REC_ORDER[sample.recommendation] !== undefined ? sample.recommendation : 'review';
      if (REC_ORDER[srec] > REC_ORDER[rec]) rec = srec;
      var osvIds = (sample.osv || []).map(function (o) { return o.id; }).filter(Boolean);
      var head = 'Atlas の検査済みサンプル「' + (sample.name || sample.id) + '」に一致' +
        (sample.grade ? '（グレード ' + sample.grade + (sample.trust != null ? '・' + sample.trust + '/100' : '') + '）' : '') +
        '：サンプルの判定は' + REC_LABEL[srec] + (osvIds.length ? '（OSV ' + osvIds.join(', ') + '）' : '');
      reasons.push(head);
      (sample.reasons || []).forEach(function (r) { reasons.push(redact(r)); });
      reasons.push('注記：サンプルの検出は静的検査の「パターン」であり、このプロジェクトに悪意があると断定するものではありません');
    }
    sorted.forEach(function (f) { reasons.push(findingReason(f)); });
    if (inArr(notes, 'vscode-input')) reasons.push('注記：VS Code の ${input:...} 変数を使用しています（Claude Code では展開されません）');
    if (inArr(notes, 'secrets')) reasons.push('注記：直書きの認証情報は ${VAR} プレースホルダーに置き換えました。生成するファイルにも元の値は含まれません');
    if (!sample && !findings.some(function (f) { return f.sev !== 'low' && f.sev !== 'info'; })) {
      reasons.push(APPROVE_REASON);
    }
    if (rec === 'deny') {
      if (sample && sample.recommendation === 'deny') reasons.push('判定：一致したサンプルの判定が拒否推奨のため拒否推奨');
      else reasons.push('判定：critical のパターンを検出したため拒否推奨（' + sorted[0].rule + '）');
    } else if (rec === 'review') {
      if (cfgRec === 'review') reasons.push('判定：high / medium のパターンを検出したため要レビュー（自動承認しません）');
      else reasons.push('判定：一致したサンプルの判定に合わせて要レビュー');
    }
    return { recommendation: rec, reasons: reasons };
  }

  function evaluate(text, opts) {
    opts = opts || {};
    var parsed = parseConfig(text);
    if (parsed.error) return { format: parsed.format, error: parsed.error, items: [] };
    var samples = opts.samples || [];
    var items = parsed.servers.map(function (s) {
      var r = configFindings(s.name, s.cfg, s.key, parsed.raw);
      var argv = argvOf(s.cfg);
      var sample = matchSample(samples, r.packages, serverRepos(r.packages, r.urls, argv));
      var rec = recommendItem(r.findings, r.notes, sample);
      return {
        name: s.name, kind: 'mcp', cfg: s.cfg, sanitized: r.sanitized,
        packages: r.packages, urls: r.urls, findings: r.findings,
        recommendation: rec.recommendation, recommendationJa: REC_LABEL[rec.recommendation],
        reasons: rec.reasons, sample: sample || null
      };
    });
    return { format: parsed.format, items: items };
  }

  // -------------------------------------------------------------------------
  // Outputs (approved items only, sanitized configs only)
  // -------------------------------------------------------------------------
  function claudeServerEntry(cfg) {
    var out = {};
    if (truthy(cfg.url) && !truthy(cfg.command)) {
      var t = str(truthy(cfg.type) ? cfg.type : 'http').toLowerCase();
      out.type = t === 'sse' ? 'sse' : 'http';
      out.url = cfg.url;
      if (truthy(cfg.headers)) out.headers = cfg.headers;
      if (truthy(cfg.oauth)) out.oauth = cfg.oauth;
      if (truthy(cfg.headersHelper)) out.headersHelper = cfg.headersHelper;
    } else {
      out.type = 'stdio';
      var argv = argvOf(cfg);
      out.command = argv.length ? argv[0] : cfg.command;
      if (argv.length > 1) out.args = argv.slice(1);
      if (truthy(cfg.env)) out.env = cfg.env;
    }
    return out;
  }
  // A URL whose query credential was replaced by ${ATLAS_URL_TOKEN...} would never equal the real URL,
  // so match on scheme + host + path and let the query vary (serverUrl supports * wildcards).
  function urlMatchPattern(u) {
    u = str(u);
    if (u.indexOf('${ATLAS_URL_TOKEN') === -1) return u;
    var q = u.indexOf('?');
    var h = u.indexOf('#');
    var end = q === -1 ? (h === -1 ? u.length : h) : q;
    return u.slice(0, end) + '?*';
  }
  function matcher(cfg) {
    if (truthy(cfg.url) && !truthy(cfg.command)) return { serverUrl: urlMatchPattern(cfg.url) };
    return { serverCommand: argvOf(cfg) };
  }

  function buildOutputs(items, approvedNames, opts) {
    opts = opts || {};
    var names = approvedNames instanceof Set ? Array.from(approvedNames) : (approvedNames || []);
    var reasons = opts.reasons || {};
    var included = [], skipped = [];
    (items || []).forEach(function (it) {
      if (!inArr(names, it.name)) return;
      if (it.recommendation === 'deny' && !(opts.allowDeny && reasons[it.name] && String(reasons[it.name]).trim().length >= 3)) {
        skipped.push({ name: it.name, why: '拒否推奨の項目は出力に含めません' });
        return;
      }
      included.push(it);
    });
    var managed = { mcpServers: {} };
    included.forEach(function (it) { managed.mcpServers[it.name] = claudeServerEntry(clone(it.sanitized)); });
    var matchers = included.map(function (it) { return matcher(it.sanitized); });
    return {
      managedMcp: managed,
      claudeSettings: { allowManagedMcpServersOnly: true, allowedMcpServers: matchers },
      copilotSettings: { allowedMcpServers: clone(matchers) },
      included: included.map(function (it) { return it.name; }),
      skipped: skipped
    };
  }

  // Markdown audit record (loosely mirrors _decisions_md in allowlist_core.py).
  // Uses sanitized configs and redacted text only; reviewer reasons are redacted too.
  function mdCell(s) { return redact(str(s)).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|'); }
  function mdLine(s) { return redact(str(s)).replace(/\r?\n/g, ' '); }
  function launchOf(cfg) {
    if (!cfg) return '';
    if (truthy(cfg.url) && !truthy(cfg.command)) return str(truthy(cfg.type) ? cfg.type : 'http') + ' ' + str(cfg.url);
    return argvOf(cfg).join(' ');
  }
  function decisionsMarkdown(items, approvedNames, opts) {
    opts = opts || {};
    items = items || [];
    var reasons = opts.reasons || {};
    var when = opts.generated || new Date().toISOString();
    var out = buildOutputs(items, approvedNames, opts);
    var ok = {};
    out.included.forEach(function (n) { ok[n] = true; });
    var cnt = { approve: 0, review: 0, deny: 0 };
    items.forEach(function (it) { if (cnt[it.recommendation] !== undefined) cnt[it.recommendation]++; });
    var secretsReplaced = items.some(function (it) {
      return it.findings.some(function (f) { return f.rule === 'ATL-CR-003' || f.rule === 'ATL-CR-005'; });
    });
    var L = ['# Atlas Allowlist Builder - decisions / 判定記録', '',
      '- Generated / 生成日時 (UTC): ' + when,
      '- Tool: Allowlist Builder デモ（オフライン・起動設定ルールのみ, engine ' + API.version + '）',
      '- Servers / サーバー: ' + items.length + '（承認推奨 ' + cnt.approve + ' / 要レビュー ' + cnt.review + ' / 拒否推奨 ' + cnt.deny + '）',
      '- Approved / 承認: ' + out.included.length,
      '- Secrets / シークレット: 直書きの認証情報は ${VAR} プレースホルダーに置き換えて記録しています。元の値はこの記録にも出力にも含まれません' +
        (secretsReplaced ? '（今回の入力で置き換えあり）' : '（今回の入力では置き換えなし）'),
      '', '判定は静的な「パターンを検出」した結果であり、悪意や安全性を断定するものではありません。', '',
      '| Server | Atlas rec. | Decision |', '|---|---|---|'];
    items.forEach(function (it) {
      var dec = ok[it.name] ? 'APPROVED / 承認' : 'NOT APPROVED / 不承認';
      if (ok[it.name] && it.recommendation !== 'approve') dec += " (reviewed '" + it.recommendation + "')";
      L.push('| ' + mdCell(it.name) + ' | ' + it.recommendation + ' | ' + dec + ' |');
    });
    items.forEach(function (it) {
      L.push('', '## ' + mdLine(it.name));
      L.push('- Recommendation / 推奨: ' + it.recommendation + '（' + REC_LABEL[it.recommendation] + '）');
      L.push('- Approved / 承認: ' + (ok[it.name] ? 'yes' : 'no'));
      if (ok[it.name] && it.recommendation !== 'approve') {
        L.push('- Reviewer reason / 承認理由: ' + (str(reasons[it.name]).trim() ? mdLine(str(reasons[it.name]).trim()).slice(0, 1000) : '(none)'));
      }
      L.push('- Launch (sanitized) / 起動設定: `' + mdLine(launchOf(it.sanitized)).replace(/`/g, "'") + '`');
      var rids = [];
      it.findings.forEach(function (f) { if (!inArr(rids, f.rule)) rids.push(f.rule); });
      L.push('- Rule ids / ルール: ' + (rids.length ? rids.join(', ') : '(none)'));
      if (it.sample) L.push('- Matched sample / 一致サンプル: ' + mdLine(it.sample.name || it.sample.id) + (it.sample.grade ? '（等級 ' + it.sample.grade + '）' : '') + ' - パターンの指摘であり、悪意の断定ではありません');
      var top = (it.reasons || []).slice(0, 5);
      if (top.length) {
        L.push('- Top reasons / 主な根拠:');
        top.forEach(function (r) { L.push('  - ' + mdLine(r).slice(0, 300)); });
      }
    });
    return L.join('\n') + '\n';
  }

  var API = {
    version: '0.1-demo',
    decisionsMarkdown: decisionsMarkdown,
    parseConfig: parseConfig,
    evaluate: evaluate,
    buildOutputs: buildOutputs,
    configFindings: configFindings,
    checkUrl: checkUrl,
    derivePackages: derivePackages,
    parseNpmSpec: parseNpmSpec,
    parsePypiSpec: parsePypiSpec,
    gitRefPinned: gitRefPinned,
    dockerPrivileges: dockerPrivileges,
    argvOf: argvOf,
    hasSecret: hasSecret,
    redact: redact,
    urlMatchPattern: urlMatchPattern, claudeServerEntry: claudeServerEntry,
    matcher: matcher,
    stripJsonc: stripJsonc,
    CONFIG_RULES: CONFIG_RULES,
    SCAN_RULES: SCAN_RULES,
    REC_LABEL: REC_LABEL
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.AtlasEngine = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
