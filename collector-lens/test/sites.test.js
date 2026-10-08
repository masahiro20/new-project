const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers");

const CL = load();

test("detects listing pages on the four target sites", () => {
  const cases = [
    ["https://page.auctions.yahoo.co.jp/jp/auction/x123456789", "yahoo_auctions", true],
    ["https://auctions.yahoo.co.jp/search/search?p=nikon", "yahoo_auctions", false],
    ["https://jp.mercari.com/item/m12345678901", "mercari", true],
    ["https://jp.mercari.com/search?keyword=seiko", "mercari", false],
    ["https://item.fril.jp/abcdef0123456789", "rakuma", true],
    ["https://order.mandarake.co.jp/order/detailPage/item?itemCode=1", "mandarake", true]
  ];
  for (const [url, id, listing] of cases) {
    const hit = CL.detectSite(url);
    assert.ok(hit, url);
    assert.equal(hit.site.id, id, url);
    assert.equal(hit.isListing, listing, url);
  }
});

test("ignores other sites, look-alike hosts and plain http", () => {
  for (const url of [
    "https://www.ebay.com/itm/1",
    "https://auctions.yahoo.co.jp.evil.example/jp/auction/x1",
    "https://evil-jp.mercari.com.example/item/m1",
    "http://jp.mercari.com/item/m1",
    "not a url"
  ]) assert.equal(CL.detectSite(url), null, url);
});

test("Yahoo order: Yahoo! Auctions is priority 1", () => {
  const sorted = [...CL.SITES].sort((a, b) => a.priority - b.priority).map((s) => s.id);
  assert.deepEqual(sorted, ["yahoo_auctions", "mercari", "rakuma", "mandarake"]);
});
