export const SITE_NAME = "LAND SCAN";
export const SITE_SUBTITLE = "ホームランディック 土地・法令調査";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
