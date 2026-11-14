// Affiliate offers shown inside guides. An offer appears on the site only once
// it is listed here with the tracking URL issued by the ASP after approval, so
// pages never show a dead or unapproved link.

export type OfferCategory = "billing-software" | "recruiting" | "factoring" | "startup";

export type Offer = {
  /** Used in /go/<id>; lowercase letters, digits and hyphens. */
  id: string;
  category: OfferCategory;
  name: string;
  /** One or two factual sentences, checked against the advertiser's own page. */
  point: string;
  /** Tracking URL issued by the ASP. */
  url: string;
};

export const OFFER_HEADINGS: Record<OfferCategory, string> = {
  "billing-software": "請求・記録ソフトの資料請求",
  recruiting: "福祉職の採用サービス",
  factoring: "資金調達サービス",
  startup: "開業・運営の支援サービス",
};

export const OFFERS: Offer[] = [];

const usable = (o: Offer) => /^[a-z0-9-]+$/.test(o.id) && o.url.startsWith("https://");

export function offersFor(categories: OfferCategory[] | undefined): Offer[] {
  return categories?.length ? OFFERS.filter((o) => categories.includes(o.category) && usable(o)) : [];
}

export function getOffer(id: string): Offer | undefined {
  return OFFERS.find((o) => o.id === id && usable(o));
}
