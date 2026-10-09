// Purchase terms shown to buyers and enforced by the server. Client-safe (no Stripe SDK).
export const PRODUCT_NAME = "減算ゼロ 年間書類セット（虐待防止・身体拘束等適正化）";

/**
 * AI generations allowed per purchase, all three sets together, within the 7 days a session is
 * valid (本部の決定 d30). The first run uses 3, leaving 12 for re-creating sets that failed.
 */
export const GENERATIONS_PER_PURCHASE = 15;
export const PURCHASE_VALID_DAYS = 7;
