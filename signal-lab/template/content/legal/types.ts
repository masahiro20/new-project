import type { ProductConfig } from "@/lib/config";

export type LegalSection = { heading: string; body: string[] };
/** A legal template: config in, sections out. Edit the wording per launch if needed. */
export type LegalDoc = (c: ProductConfig) => { title: string; sections: LegalSection[] };
