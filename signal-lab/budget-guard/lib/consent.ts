import { LEGAL_VERSIONS } from "@/content/legal/version";

// Consent to the Privacy Policy (incl. the transfer of personal data to companies abroad,
// APPI art. 28 — docs/legal-changes.md §2.3) and the Terms. Pure: no next/* imports.

export type ConsentVia = "checkout" | "demo-card" | "add-connection" | "reconsent";
export type ConsentRecord = { at: string; privacy: string; terms: string; via: ConsentVia };

export const newConsent = (via: ConsentVia, now = new Date()): ConsentRecord => ({ at: now.toISOString(), ...LEGAL_VERSIONS, via });

/** The record covers the versions in force now. */
export const consentCurrent = (c: ConsentRecord | null | undefined): boolean =>
  !!c && c.privacy === LEGAL_VERSIONS.privacy && c.terms === LEGAL_VERSIONS.terms;

/** API bodies must carry `consent: true` (the checkbox); anything else is a 400. */
export const hasConsentFlag = (body: Record<string, unknown> | null | undefined): boolean => body?.consent === true;

export const CONSENT_REQUIRED_ERROR = "Please agree to the Privacy Policy (including the transfer of data to companies abroad) and the Terms of Service.";
