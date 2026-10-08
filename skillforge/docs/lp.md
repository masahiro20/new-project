# Yuragi: Landing Page Copy (DRAFT)

> **DRAFT — NOT FOR PUBLICATION.** Internal copy draft for P1 SkillForge (Growth).
> **"Yuragi" (揺らぎ, "drift / wobble") is a working name (仮称).** The trademark check is still pending, so the name may change before launch.
> All script lines, character names and terms below are invented for illustration. They are not taken from any real game.
> Nothing on this page has been published, posted, or linked anywhere.

---

## Hero

### Headline
**Catch the drift before your players do.**

### Subhead
Yuragi checks your whole Japanese↔English script for consistency. It finds glossary terms, character names, honorifics and character voices that drift between line 14 and line 4,000, and it reports every case with file and line numbers.

**[ Join the waitlist ]**  ·  *Works with your own AI assistant via MCP (e.g. Claude Code, Claude Desktop).*

---

## The problem

Your translation was done by three people over six months. Someone renamed a character halfway through. The glossary was updated after chapter 2.

Now the same item is called the **Mana Stone** in 40 lines and the **Magic Stone** in 2. Lisette is spelled **Lizette** in one scene. The proud knight who never uses contractions says **"I'm gonna"** in the final battle. In the Japanese build, **サーバー** and **サーバ** appear side by side.

None of these is a typo that a spell-checker would catch. They are **drift**: small inconsistencies spread across tens of thousands of lines, which no one can hold in their head at once. Players do notice, though, and they post screenshots.

Traditional QA tools check one segment at a time: tags, numbers, double spaces. Yuragi reads **the whole script** and asks whether it stays consistent with itself.

---

## How it works

**1. Bring your script and your glossary.**
Upload your string tables (CSV, JSON, or XLIFF 1.2 / 2.0). Add a glossary with your terms and a simple character sheet (names, approved nicknames, honorific rules, voice notes).

**2. Run the check from your AI assistant.**
Connect Yuragi as an MCP server in the assistant you already use (for example, Claude Code or Claude Desktop) and ask it to check your script. Yuragi's deterministic engine finds clear-cut drift. Ambiguous voice cases are packed into small review packets, which **your own assistant** judges on your own subscription.

**3. Get a report with line numbers.**
Every finding points to a file and a line. Fix it in your tool of choice, then run the check again.

---

## Sample report (illustrative)

```text
Yuragi consistency report — project: "Starfall Lantern" (sample data)
Files: script_ch1-5.csv (4,212 lines), glossary.csv (138 terms), characters.yml (9 characters)

[TERM DRIFT] 魔導石 → expected "Mana Stone" (glossary)
  "Mana Stone"   40 lines
  "Magic Stone"   2 lines   script.csv:1187, script.csv:2904

[KATAKANA DRIFT] (JA source)
  マナ・ストーン ×12 / マナストーン ×3   script.csv:88, script.csv:412, script.csv:3301

[NAME DRIFT] Lisette (characters.yml)
  "Lizette" (near-miss)          script.csv:14
  "Lise" (nickname not approved) script.csv:2230
  speaker label "LISSETTE"       script.csv:3018

[HONORIFIC DRIFT] Mio → Lisette (リゼット様)
  policy: "Lady Lisette"
  "Lady Lisette" 27 lines
  "Lisette"       3 lines   script.csv:640, script.csv:1502, script.csv:1503
  "Lisette-sama"  1 line    script.csv:2877   (violates honorific policy: no -sama)

[VOICE — REVIEW PACKET] Sir Garrick (voice note: formal, never uses contractions)
  script.csv:3912  "I'm gonna hold the gate."
  first-person in JA source: 私 (expected) → 俺 at script.csv:3910
  → sent to your assistant for judgment (3 lines of context)

[BONUS] placeholder mismatch   script.csv:771   JA {player_name} / EN {playername}
[BONUS] length limit 40 (full-width counted)   script.csv:1290   46 chars

Summary: 11 findings (8 deterministic, 1 review packet, 2 bonus)
```

---

## What Yuragi checks

### 1. Glossary term drift
- Finds every rendering of each glossary term across the whole script, not only the first mismatch.
- Shows the split: "Mana Stone" ×40 vs "Magic Stone" ×2, with the line numbers of the outliers.
- Checks Japanese notation drift as well: katakana variants (サーバー / サーバ), middle dots (マナ・ストーン / マナストーン), and similar spellings.

### 2. Character-name drift
- Near-miss spellings (Lizette vs Lisette) and stray transliterations.
- Nicknames that are not on your character sheet.
- Speaker-label drift (LISETTE / Lisette / LISSETTE) in the speaker column.

### 3. Honorific and voice drift
- Tracks how each **speaker → addressee** pair is rendered. Does 様 become "Lady Lisette", plain "Lisette", or "Lisette-sama"? Is that consistent, and does it follow your honorific policy?
- Flags when a character's first-person pronoun (俺 / 僕 / 私) or politeness level changes without warning.
- Catches breaks in a defined voice, such as the knight who "never uses contractions" suddenly saying "gonna".
- Ambiguous cases become **review packets**: just the lines needed, judged by your own AI assistant. A person makes the final decision.

### Also included (the basics)
Placeholder and tag mismatches, ruby markup checks, and length limits with full-width character counting. These are standard checks that tools like Xbench and Verifika already do well. We include them so you don't have to run two passes.

---

## Who it's for

- **Japanese indie developers shipping an English version.** You can't read every English line yourself, but you can read a report that says "line 1187 calls it something else".
- **JP↔EN freelance translators and LQA testers.** Hand in a cleaner deliverable, and spend your review time on the hard judgment calls instead of searching for variants.
- **Visual novel developers (Ren'Py and similar).** Long, dialogue-heavy scripts with many characters are exactly where names, honorifics and voice drift the most.
- **Small JP→EN publishers.** Share one glossary and one character sheet across your team and every title you publish.

---

## Trust and privacy

- **We don't store your script.** The service is stateless: a file is processed for the check and then discarded. Glossaries are saved only if you choose to save them (for example, a shared Studio glossary).
- **Reasoning runs on your own AI subscription.** Our engine does the deterministic checks. Judgment calls happen in your assistant, under the terms you already accepted, and we only send it the lines it needs.
- **NDA-friendly by design.** Minimal data in, report out.
- **Enterprise option:** no-retention mode, a dedicated instance, and paperwork for your legal team.
- **An assistant, not a replacement.** Research on LLM-based game LQA (AMTA 2026, peer-reviewed) found that even the best model reached an F1 score of about 0.77, and Japanese was the hardest language tested. That is why Yuragi reports findings and leaves the decisions to people.

---

## Pricing (planned, subject to change)

| Plan | Price | For | Includes |
|---|---|---|---|
| **Per title** | **$49 one-off** | One game, one release | Unlimited checks for a single title for a limited period (TBD), all core checks |
| **Solo** | **$29 / month** | Freelance translators, LQA testers, solo devs | All core checks, personal glossaries and character sheets |
| **Studio** | **$99 / month** | Small teams and publishers | 5 seats, shared glossary and character sheets |
| **Enterprise** | **Contact us** | Larger publishers, NDA-heavy work | No-retention mode, dedicated instance, custom terms |

*AI assistant subscription not included. Yuragi works with the assistant you already use.*
*Waitlist members will be the first to hear about launch pricing.*

---

## FAQ

**Do you store my script?**
No. Scripts are processed for the check and then discarded; we don't keep copies. Glossaries and character sheets are stored only if you save them to your account. Enterprise customers can turn on a no-retention mode for everything.

**Does it replace LQA testers?**
No. Yuragi is a QA assistant. It finds drift across a whole script faster than a person can. Deciding whether a line is *right* (tone, context, intent) still needs a human reviewer. Current research shows AI is not yet reliable enough to do game LQA alone, especially for Japanese.

**Which file formats are supported?**
At launch: CSV, JSON and XLIFF (1.2 and 2.0) string tables. Tell us what you use when you join the waitlist (Ren'Py `.rpy`, PO, Excel and others). That input decides what we add next.

**Do I need a glossary?**
It helps, but you can start without one. Without a glossary, Yuragi groups source terms with inconsistent renderings so you can choose the correct one. That choice becomes your first glossary. A character sheet makes the name, honorific and voice checks much more precise.

**Which AI assistant do I need?**
Any assistant that supports remote MCP servers. We are testing with Claude Code and Claude Desktop first. Yuragi is an independent product and is not affiliated with or endorsed by any AI provider.

**Does it work in both directions?**
Yes: Japanese→English and English→Japanese. Katakana notation checks apply to Japanese text. Honorific and voice checks are built around Japanese source text being rendered in English.

**How is this different from Xbench or Verifika?**
Those tools are great at segment-level checks: tags, numbers, terminology matches. Yuragi focuses on **whole-script consistency**: how a character is addressed across hundreds of scenes, and whether a voice holds up from chapter 1 to the ending. Yuragi does run the basic checks too, so you can use it alone or alongside those tools.

**When does it launch?**
We're building it now. Waitlist members get early access and a chance to shape the first version.

---

## Waitlist CTA

### Ship a script that sounds like one writer wrote it.
Join the waitlist for early access. Tell us your file format and language direction, and we'll prioritize those.

```
[ email address                ]  [ Join the waitlist ]
(optional) Your role: ( ) Developer  ( ) Translator / LQA  ( ) Publisher  ( ) Other
(optional) File format: ____________
```
*Placeholder form, not connected. We'll only email you about Yuragi. Unsubscribe any time.*

---

## 日本語版の要約（日本のインディー開発者向け）

**英語版の「揺らぎ」を、プレイヤーより先に見つける。**

Yuragi（仮称）は、日英ゲームローカライズ用の「台本全体の一貫性チェック」ツールです。

- **用語の揺れ:** 「魔導石」が40行では "Mana Stone"、2行では "Magic Stone" になっている箇所を、行番号付きで指摘します。サーバー／サーバ、マナ・ストーン／マナストーンなど、日本語側の表記揺れも検出します。
- **キャラ名の揺れ:** Lisette と Lizette のようなつづり違い、未承認の愛称、話者ラベルの不統一を見つけます。
- **敬称・口調の揺れ:** 「リゼット様」が "Lady Lisette" / "Lisette" / "Lisette-sama" のどれで訳されているかを話者ごとに追跡します。一人称（俺／僕／私）や丁寧さの急な変化も検出します。
- **使い方:** CSV / JSON / XLIFF の文字列テーブルと用語集を渡すと、`script.csv:14` のように行番号付きのレポートが返ります。
- **判断はあなたのAIで:** 判断が難しい箇所は、お使いのAIアシスタント（Claude Code など、MCP対応のもの）が確認します。当社に送るデータは最小限です。
- **台本は保存しません。** NDA案件でも使いやすい設計です。
- **テスターの代わりではなく、QAの補助です。** 最終判断は人が行います。
- **価格（予定）:** 1タイトル $49 ／ Solo 月$29 ／ Studio 月$99（5席）／ 法人は個別見積もり。

英語が読めなくても、「1187行目だけ呼び方が違う」というレポートなら確認できます。
**待機リストに登録して、先行アクセスをお待ちください。**

---

## Notes for HQ (not part of the page)

### Claims that must be verified before publishing
1. **"We don't store your script" / stateless.** This must match the actual implementation, including logs, error traces, crash reports, and any hosting or CDN request logging. Otherwise reword it to "not retained beyond X".
2. **The AMTA 2026 figure (best LLM F1 ≈ 0.77, Japanese hardest).** Re-check the exact number and wording against the paper (aclanthology.org/2026.amta-research.12). Decide whether to cite it with a link. The LP does not name the model on purpose.
3. **Supported formats (CSV / JSON / XLIFF 1.2 & 2.0)** and **both directions (JA→EN and EN→JA).** Only claim what the MVP actually parses and tests. EN→JA honorific/voice checks may be weaker; consider "JA→EN first".
4. **"Works without a glossary" (auto-grouping of inconsistent renderings).** Confirm this feature will exist at launch, or remove it from the FAQ.
5. **Ruby markup checks and full-width length counting.** Confirm which ruby syntaxes (e.g. Ren'Py `{rb}`, custom tags) and counting rules are supported.
6. **"Any assistant that supports remote MCP servers."** Only claim compatibility with clients we have tested. Keep the non-affiliation disclaimer. Never use "Claude" in the product name or logo, and never imply endorsement by Anthropic.
7. **Competitor descriptions and price anchors** (Xbench €99/yr, Verifika $72–299/yr, Gridly €50/mo+). These are not on the page as numbers, but re-check them before any comparison table is added. Keep the competitor wording factual and fair.
8. **Pricing.** All four plans are tests. The per-title "limited period" and the Solo usage limits are still TBD. The prices are not final and are labeled as such.
9. **The sample report** uses invented data ("Starfall Lantern", Lisette, Sir Garrick, Mio). Before publishing, confirm that none of these collide with a real game or character name.
10. **ToS check.** Confirm the "reasoning runs on your own AI subscription" model complies with the AI provider's usage terms (no reselling of, or routing through, a user's consumer plan). If our server ever calls an LLM, it must use our own API key and the cost must be included in our price.
11. **Privacy policy and terms.** A privacy policy is required before collecting any waitlist email (and before mentioning GDPR or APPI).

### Items needing owner approval
- **Product name / trademark:** "Yuragi" is provisional until the trademark search (JP + US at minimum) is done.
- **Domain:** purchase and choice of domain (owner only).
- **Publishing the LP** and connecting a real waitlist form provider. Also the choice of analytics, if any.
- **X account / build-in-public posts** and any outreach to the communities named in the stage 1 report (ProZ, Lemma Soft, r/visualnovels, etc.).
- **Enterprise promises** (dedicated instance, no-retention mode, legal paperwork): only offer what we can actually deliver.
- **Final pricing** to show publicly, including whether to show the per-title $49 plan alongside the subscriptions (A/B test design).
