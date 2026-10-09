import type { ProductConfig } from "@/lib/config";

export type LegalSection = { heading: string; body: string[] };
/** A legal template: config in, sections out. Edit the wording per launch if needed. */
export type LegalDoc = (c: ProductConfig) => { title: string; sections: LegalSection[] };

/**
 * Marks every clause drafted for expert (lawyer) review. It is shown on the page on purpose
 * while the drafts are under review; remove every occurrence before launch (docs/legal-changes.md).
 */
export const REVIEW_MARK = "【要専門家確認】";
