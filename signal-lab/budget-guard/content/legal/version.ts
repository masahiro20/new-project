/**
 * Versions of the Privacy Policy and the Terms. Bump the date whenever the wording that
 * people agree to changes: everyone whose recorded consent has an older version is asked
 * to agree again the next time they open the dashboard (lib/consent.ts), and can't add a
 * connection or arm a live stop until they do.
 */
export const LEGAL_VERSIONS = { privacy: "2026-10-09", terms: "2026-10-09" } as const;
