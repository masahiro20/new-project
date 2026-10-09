// Types for lib/security-headers.mjs (plain JS so the post-build script can run it with node).
export type InlineSources = { scripts: string[]; styles: string[]; styleAttrs: string[] };
export type Policies = { routes: Record<string, string>; fallback: string; nonHtml: string; common: Record<string, string> };
export const REFERRER_POLICY: string;
export const COMMON_HEADERS: Record<string, string>;
export const FORM_ACTION_EXTRA: string[];
export const NON_HTML_CSP: string;
export function inlineSources(html: string): InlineSources;
export function pageCsp(sources?: Partial<InlineSources>, opts?: { dev?: boolean }): string;
export function mergeSources(list: InlineSources[]): InlineSources;
export function routeOf(relativeHtmlPath: string): string | null;
export function buildPolicies(pages: Record<string, string>): Policies;
export function cspForPath(policies: Policies, pathname: string): string;
