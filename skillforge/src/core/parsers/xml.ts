// A small, dependency-free XML reader for glossary interchange files (TBX). Browser-safe (no node: imports).
// Handles elements, attributes, namespace prefixes (exposed as local names), the predefined and numeric entities,
// internal-subset <!ENTITY> declarations, CDATA, comments, processing instructions and a DOCTYPE. It is not
// validating and does not resolve external entities.

export interface XmlElement {
  /** Name as written, with any prefix ("tbx:term"). */
  qname: string;
  /** Local name without the prefix ("term"). */
  name: string;
  /** Attributes by qualified name ("xml:lang", "type"). */
  attrs: Record<string, string>;
  children: XmlNode[];
  /** 1-based line of the start tag. */
  line: number;
}
export type XmlNode = XmlElement | string;

const PREDEFINED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

const localName = (q: string) => q.slice(q.indexOf(":") + 1);

function decodeEntities(s: string, entities: Record<string, string>, depth = 0): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z_][\w.\-]*);/g, (all, ref: string) => {
    if (ref[0] === "#") {
      const cp = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : all;
    }
    if (ref in PREDEFINED) return PREDEFINED[ref]!;
    if (ref in entities && depth < 4) return decodeEntities(entities[ref]!, entities, depth + 1);
    return all;
  });
}

/** Parses an XML document and returns its root element. Throws with a line number on malformed markup. */
export function parseXml(text: string): XmlElement {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const entities: Record<string, string> = {};
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let i = 0;
  let line = 1;
  const advance = (to: number) => {
    for (let k = i; k < to; k++) if (src.charCodeAt(k) === 10) line++;
    i = to;
  };
  const fail = (msg: string): never => {
    throw new Error(`XML line ${line}: ${msg}`);
  };
  const addText = (t: string) => {
    const top = stack[stack.length - 1];
    if (top && t) top.children.push(t);
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      if (stack.length && src.slice(i).trim()) addText(decodeEntities(src.slice(i), entities));
      advance(src.length);
      break;
    }
    if (lt > i) {
      addText(decodeEntities(src.slice(i, lt), entities));
      advance(lt);
    }
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      if (end < 0) fail("unterminated comment");
      advance(end + 3);
    } else if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i + 9);
      if (end < 0) fail("unterminated CDATA section");
      addText(src.slice(i + 9, end));
      advance(end + 3);
    } else if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i + 2);
      if (end < 0) fail("unterminated processing instruction");
      advance(end + 2);
    } else if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!doctype", i)) {
      // Skip the DOCTYPE, remembering simple internal entity declarations.
      let k = i + 9;
      let depth = 0;
      for (; k < src.length; k++) {
        const ch = src[k];
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (ch === '"' || ch === "'") {
          const close = src.indexOf(ch, k + 1);
          if (close < 0) break;
          k = close;
        } else if (ch === ">" && depth <= 0) break;
      }
      if (k >= src.length) fail("unterminated DOCTYPE");
      const decl = src.slice(i, k + 1);
      for (const m of decl.matchAll(/<!ENTITY\s+([A-Za-z_][\w.\-]*)\s+(?:"([^"]*)"|'([^']*)')\s*>/g)) entities[m[1]!] ??= m[2] ?? m[3] ?? "";
      advance(k + 1);
    } else if (src.startsWith("</", i)) {
      const end = src.indexOf(">", i);
      if (end < 0) fail("unterminated end tag");
      const qname = src.slice(i + 2, end).trim();
      const top = stack.pop();
      if (!top) fail(`unexpected </${qname}>`);
      if (top!.qname !== qname) fail(`</${qname}> does not close <${top!.qname}>`);
      advance(end + 1);
    } else {
      // Start tag: scan to the closing ">" outside quoted attribute values.
      let k = i + 1;
      let quote = "";
      for (; k < src.length; k++) {
        const ch = src[k];
        if (quote) {
          if (ch === quote) quote = "";
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === ">") break;
      }
      if (k >= src.length) fail("unterminated start tag");
      const selfClosing = src[k - 1] === "/";
      const body = src.slice(i + 1, selfClosing ? k - 1 : k);
      const nameMatch = /^[^\s/>]+/.exec(body);
      if (!nameMatch) fail("missing element name");
      const qname = nameMatch![0];
      const attrs: Record<string, string> = {};
      for (const m of body.slice(qname.length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[m[1]!] = decodeEntities((m[2] ?? m[3] ?? "").replace(/[\t\n\r]/g, " "), entities);
      }
      const el: XmlElement = { qname, name: localName(qname), attrs, children: [], line };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(el);
      else if (root) fail(`second root element <${qname}>`);
      else root = el;
      advance(k + 1);
      if (!selfClosing) stack.push(el);
    }
  }
  if (stack.length) throw new Error(`XML: <${stack[stack.length - 1]!.qname}> is never closed`);
  if (!root) throw new Error("XML: no root element");
  return root;
}

/** Child elements, optionally only those with one of the given local names. */
export const childElements = (el: XmlElement, ...names: string[]): XmlElement[] =>
  el.children.filter((c): c is XmlElement => typeof c !== "string" && (!names.length || names.includes(c.name)));

/** Concatenated text of an element and its descendants. */
export function textContent(el: XmlElement): string {
  let out = "";
  for (const c of el.children) out += typeof c === "string" ? c : textContent(c);
  return out;
}

/** Attribute by local name, so "xml:lang", "lang" and a prefixed "tbx:type" all match. */
export function attrOf(el: XmlElement, name: string): string | undefined {
  if (name in el.attrs) return el.attrs[name];
  for (const [k, v] of Object.entries(el.attrs)) if (localName(k) === name) return v;
  return undefined;
}

/** Depth-first descendants (not including `el`) with one of the given local names. */
export function descendants(el: XmlElement, ...names: string[]): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (e: XmlElement) => {
    for (const c of e.children) {
      if (typeof c === "string") continue;
      if (names.includes(c.name)) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}
