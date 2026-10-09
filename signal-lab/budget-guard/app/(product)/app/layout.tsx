import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

// Static shell. The pages under /app render in the browser from /api/app/* routes,
// and those routes do the access check (signed cookie + active entitlement) on every
// call; a 401 sends the visitor to /access. Nothing account-specific is prerendered.
export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <div className="wrap">{children}</div>;
}
