<!-- Chrome Web Store "Privacy practices" tab draft + privacy policy text. NOT submitted. -->
# Privacy practices — Tanuki Scout (provisional)

## Single purpose
Explain the Japanese condition, grade and return wording on the marketplace listing the user is viewing, in English, and flag risky terms.

## Permission justifications
| Permission | Justification |
|---|---|
| `permissions` | None requested. |
| Host permission `https://page.auctions.yahoo.co.jp/*` | Read the open Yahoo! Auctions Japan item page to explain its condition and return terms. |
| Host permission `https://jp.mercari.com/*` | Read the open Mercari item page. Mercari is a single-page app, so the script matches the whole site and only runs on `/item/` and `/shops/product/` pages. |
| Host permission `https://item.fril.jp/*` | Read the open Rakuma item page. |
| Host permission `https://order.mandarake.co.jp/*` | Read the open Mandarake item page. |
| Remote code | No. All code and the glossary ship inside the package. No `eval`, no remote scripts. |

## Data usage (answers for the form)
- Collects none of: personally identifiable information, health, financial and payment, authentication, personal communications, location, web history, user activity, website content.
  - Note: the extension *reads* the listing text on screen to explain it, but this text never leaves the browser and is not stored. Under the CWS definitions this is not collection.
- Certifications (all true):
  - I do not sell or transfer user data to third parties, outside of the approved use cases.
  - I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy (text to host at the privacy policy URL)

**Tanuki Scout privacy policy** — effective on first publication.

Tanuki Scout does not collect, store, sell or share any personal data.

- The extension runs only on item pages of Yahoo! Auctions Japan, Mercari, Rakuma and Mandarake.
- On those pages it reads the listing text shown in your current tab and analyzes it inside your browser using a glossary that ships with the extension.
- It makes no network requests. It has no server, no analytics, no account and no cookies.
- It does not use browser storage and does not access other tabs, your history or any other site.
- It adds its own panel to the page and does not change the listing.

If this policy changes, the new version will be published at this address before the change takes effect. Contact: *owner to provide*.

## Before submission (owner)
- Final name and trademark search (see `docs/naming.md`).
- Developer account ($5 one-time) and a contact email.
- Host this privacy policy at a public URL and add a homepage / support URL.
- Lawyer check on Yahoo! Auctions terms 8.3 ("alteration") and the panel overlay, as already requested.
