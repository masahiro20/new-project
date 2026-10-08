export type Guide = {
  slug: string;
  title: string;
  description: string;
  /** First publication date (YYYY-MM-DD). Falls back to `updated`. */
  published?: string;
  updated: string;
  /** Answer-first summary: the passage AI search engines are most likely to quote. */
  summary: string;
  body: string;
  sources: { label: string; url: string }[];
  /** Set on per-service guides; used for grouping on /guide and the FAQ/BreadcrumbList structured data. */
  serviceType?: string;
  faq?: { q: string; a: string }[];
};
