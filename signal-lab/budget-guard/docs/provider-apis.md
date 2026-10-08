# Budget Guard — プロバイダ API 調査（公式ドキュメントのみ）

調査日: 2026-10-08。出典は各主張の直後に記載。認証付きエンドポイントは呼んでおらず、実キーも使っていない。
「未確認」は公式ドキュメントで裏付けが取れなかった項目。末尾の §5 にまとめた。

---

## 1. Vercel

### 1.1 使用量・コスト取得

| 項目 | 内容 |
|---|---|
| Method / URL | `GET https://api.vercel.com/v1/billing/charges?from=<ISO>&to=<ISO>&teamId=<team_id>` |
| 認証 | `Authorization: Bearer <Vercel access token>` |
| 推奨ヘッダ | `Accept-Encoding: gzip`（gzip 圧縮で返る。curl 例は `-N --compressed`） |
| クエリ | `from`（必須。範囲の開始を含む。ISO 8601 date-time、UTC）、`to`（必須。範囲の終了を含まない。ISO 8601、UTC）、`teamId` または `slug`（任意） |
| 粒度 | **1 日単位のみ**。範囲は最大 1 年 |
| レスポンス | **JSONL ストリーム**（`Content-Type: application/jsonl`、1 行 = 1 charge）。FOCUS v1.3 形式。ページネーションなし |
| 金額フィールド | `BilledCost`（請求の基礎となる金額）、`EffectiveCost`（割引やコミット額を反映した償却後コスト）、`BillingCurrency`（enum は `"USD"` のみ）。単位は**ドル**（スキーマ上は number） |
| その他フィールド | `ChargeCategory`（`Usage`/`Purchase`/`Tax`/`Credit`/`Adjustment`）、`ChargePeriodStart`/`ChargePeriodEnd`、`ServiceName`、`ServiceCategory`、`SkuId`、`ConsumedQuantity`/`ConsumedUnit`、`Tags`（ProjectId と ProjectName を含む） |
| 呼べるロール | 対象チームで Owner / Member / Developer / Security / Billing / Enterprise Viewer のいずれか |

出典: https://vercel.com/docs/rest-api/billing/list-focus-billing-charges

- 注意: スキーマでは `BilledCost` は number だが、公式のレスポンス例は `"BilledCost": "123"` と文字列になっている。number と string の両方を受け付けてパースする（同ページ）。
- 注意: このエンドポイントは Pro プランのクレジットを差し引く前の metered charges を返すと思われる。Spend Management の「予算」は Pro の月次クレジットを超えた分だけが対象（https://vercel.com/docs/spend-management）。そのため、この API の合計と Vercel の On-Demand Budget は一致しない可能性がある。→ 未確認
- 鮮度: Spend Management 自体のチェックは「数分ごと」で、通知・webhook・一時停止は数分遅れることがある（https://vercel.com/docs/spend-management）。billing charges API の反映遅延 → 未確認

### 1.2 停止アクション

**A. プロジェクトの一時停止 / 再開（REST）**

| 操作 | Method / URL | Body | 結果 |
|---|---|---|---|
| 一時停止 | `POST https://api.vercel.com/v1/projects/{projectId}/pause?teamId=<team_id>` | なし | 200（本文なし）。カスタム本番ドメインの自動割り当てを無効にし、有効な本番デプロイをブロックする。訪問者には `503 DEPLOYMENT_PAUSED` が返る |
| 再開（元に戻す） | `POST https://api.vercel.com/v1/projects/{projectId}/unpause?teamId=<team_id>` | なし | 200。本番は「数分以内」に復帰し、再デプロイは不要 |

出典: https://vercel.com/docs/rest-api/projects/pause-a-project 、 https://vercel.com/docs/rest-api/projects/unpause-a-project 、 https://vercel.com/docs/projects/managing-projects

- 停止の影響を受けるのは**本番デプロイのみ**。AI Gateway の API キー利用と v0 の利用は止まらない（https://vercel.com/docs/spend-management）。
- 公式手順は「チームスコープのアクセストークン」と `Content-Type: application/json` を使う（https://vercel.com/docs/projects/managing-projects）。

**B. ネイティブの Spend Management（Pro と、Flex Commitment 契約の Enterprise）**

- On-Demand Budget（USD、請求サイクル単位）を設定できる。通知は 50% / 75% / 100% で届き、SMS は 100% のみ。「Pause Production Deployments」を有効にすると、チームの**全プロジェクト**の本番が停止する（https://vercel.com/docs/spend-management）。
- Webhook は 50 / 75 / 100% で POST される（2025 年 9 月以前に作成した予算は 100% のみ）。Payload は `{ budgetAmount:int, currentSpend:int, teamId:string, thresholdPercent:int }`。署名は `x-vercel-signature` ヘッダで、生のリクエストボディをシークレットで HMAC-SHA1 した hex 値（https://vercel.com/docs/spend-management 、 https://vercel.com/docs/webhooks/webhooks-api#securing-webhooks）。タイムアウトは 30 秒で、2xx 以外が返ると最大 24 時間、指数バックオフで再試行される（同 webhooks-api）。
- 予算を引き上げても自動では再開されない。プロジェクトごとに unpause を呼ぶ必要がある（https://vercel.com/docs/spend-management）。
- 予算の設定に必要なロールは Owner または Billing（同）。予算を REST API で設定するエンドポイント → 未確認（ドキュメントの手順はダッシュボード操作のみ）

### 1.3 最小権限

- トークンのスコープは 3 段階: Full Account / Team / Project。Team スコープと Project スコープのトークンは `teamId` を自動推論するため省略できる（https://vercel.com/docs/accounts/access-tokens）。
- 読み取り専用やきめ細かい権限のトークンは**ドキュメントに見当たらない**。権限はトークン作成者のチームロールに従うと読める（同ページ。明記はない → 未確認）。
- billing charges には Billing などのロールが必要。pause/unpause には、ダッシュボード操作では Owner / Member / プロジェクトの Project Administrator が必要（https://vercel.com/docs/projects/managing-projects）。API でも同じロール要件かどうか → 未確認
- 推奨: **Team スコープのトークン 1 本**を、Member ロールのユーザー（またはボット用アカウント）で発行する。Member は billing charges の読み取りと pause の両方の条件を満たす。Project スコープのトークンで `/v1/billing/charges`（チームレベルのリソース）を呼べるかどうか → 未確認（Project スコープのトークンは「team-level resource へのリクエストを拒否」と書かれているため、呼べない可能性が高い）。

---

## 2. OpenAI

### 2.1 使用量・コスト取得

| 項目 | 内容 |
|---|---|
| Method / URL | `GET https://api.openai.com/v1/organization/costs` |
| 認証 | `Authorization: Bearer <OPENAI_ADMIN_KEY>`（**Admin API key**。通常の API キーは不可） |
| クエリ | `start_time`（必須。Unix 秒、開始を含む）、`end_time`（任意。Unix 秒、終了を含まない）、`bucket_width`（`"1d"` のみ。既定値も 1d）、`group_by[]`（`project_id` / `user_id` / `line_item` / `api_key_id` / `api_source`）、`project_ids[]`、`api_key_ids[]`、`line_items[]`、`limit`（1〜180、既定値 7。バケット数を指す）、`page`（前回レスポンスの `next_page` を渡す） |
| レスポンス | `{ object:"page", data:[{ object:"bucket", start_time, end_time, results:[{ object:"organization.costs.result", amount:{ value:number, currency:"usd" }, line_item, project_id, api_key_id, quantity, quantity_unit }] }], has_more:boolean, next_page:string\|null }` |
| 単位 | `amount.value` は**ドル建ての number**（例: `0.06`）。`currency` は小文字の ISO-4217（`"usd"`） |

出典: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs

- 使用量（トークン数）を返すエンドポイントもある: `GET /v1/organization/usage/{completions|embeddings|images|moderations|audio_speeches|audio_transcriptions|vector_stores|code_interpreter_sessions|file_search_calls|web_search_calls}`（https://developers.openai.com/api/reference/resources/admin）。予算の判定には Costs を使う。
- 鮮度とレイテンシ → 未確認（公式リファレンスに記載がない）。Costs は 1d バケットしかないため、当日分は部分的な値と考えて扱う。

### 2.2 停止アクション（優先度順）

| # | 操作 | Method / URL | Body | 元に戻す方法 |
|---|---|---|---|---|
| 1 | **プロジェクトのハード上限** | `POST /v1/organization/projects/{project_id}/spend_limit` | `{"threshold_amount": <cents:int≥1>, "currency":"USD", "interval":"month"}` | 上限を引き上げる（同じ POST）か、`DELETE /v1/organization/projects/{project_id}/spend_limit` |
| 1' | 組織全体のハード上限 | `POST /v1/organization/spend_limit` | 同上 | 引き上げるか、`DELETE /v1/organization/spend_limit` |
| 1'' | 上限の状態確認 | `GET /v1/organization/projects/{project_id}/spend_limit` / `GET /v1/organization/spend_limit` | — | レスポンスの `enforcement.status` が `"inactive"` か `"enforcing"` |
| 2 | プロジェクト API キーの削除 | `DELETE /v1/organization/projects/{project_id}/api_keys/{api_key_id}` | — | **元に戻せない**（キーを再発行し、アプリ側の差し替えが必要）。service account のキーには使えずエラーになる |
| 3 | service account の削除 | `DELETE /v1/organization/projects/{project_id}/service_accounts/{service_account_id}` | — | 元に戻せない（再作成が必要） |
| 4 | レート制限を下げる | `POST /v1/organization/projects/{project_id}/rate_limits/{rate_limit_id}` | `{"max_requests_per_1_minute": n, "max_tokens_per_1_minute": n, ...}` | 元の値で再度 POST（変更前の値は `GET .../rate_limits` で保存しておく） |
| 5 | プロジェクトのアーカイブ | `POST /v1/organization/projects/{project_id}/archive` | — | 「Archived projects cannot be used or updated」とある。**元に戻せない前提**で扱う |

出典: https://developers.openai.com/api/reference/resources/admin （エンドポイント一覧）、 https://developers.openai.com/api/docs/guides/admin-apis 、 https://developers.openai.com/api/docs/guides/spend-limits 、および各 method ページ（`.../projects/subresources/spend_limit/methods/update`、`.../spend_limit/methods/update`、`.../projects/subresources/api_keys/methods/delete`、`.../projects/methods/archive`、`.../projects/subresources/rate_limits/methods/update_rate_limit`）

- ハード上限に達すると、リクエストは `429` で失敗する。エラーコードは `organization_spend_limit_exceeded` または `project_spend_limit_exceeded`。上限を引き上げるか削除すると、変更の伝播後に再開する。強制は即時ではなく、少し超過することがある（https://developers.openai.com/api/docs/guides/spend-limits）。
- 「API キーを無効化する（削除せずに止める）」エンドポイントは**存在しない**（API キーの操作は list / retrieve / delete のみ。https://developers.openai.com/api/reference/resources/admin）。
- 方針: 100% 到達時の停止は「プロジェクトのハード上限を現在の使用額（またはそれ以下）に設定する」のが、最も可逆で効果も確実。上限を下回る値を設定した場合にすぐ強制が始まるかどうか → 未確認
- アラート用のネイティブ機能もある: `POST /v1/organization/projects/{project_id}/spend_alerts`、`POST /v1/organization/spend_alerts`（`threshold_amount` は cents。`notification_channel` は email）（https://developers.openai.com/api/docs/guides/admin-apis）

### 2.3 最小権限

- Admin API の全エンドポイントで Admin API key が必要。Admin キーは管理系以外のエンドポイントでは使えない（https://developers.openai.com/api/docs/guides/admin-apis）。
- Admin キーの作成 API（`POST /v1/organization/admin_api_keys`）の body は `name` と `expires_in_seconds` だけで、**スコープを指定するパラメータはない**。読み取り専用の Admin キーはドキュメントにない（https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/admin_api_keys/methods/create）。したがって、使用量の取得と停止は**同じ強権限のキー**で行うことになる。
- RBAC 表では、「Organization Admin」（users / projects / admin API keys / rate limits の管理）と「Usage」の Read は Org owner にしかない（https://developers.openai.com/api/docs/guides/rbac）。Admin キーを作れるのは実質的に Org owner と読める → 明記はない、未確認
- 推奨: Admin キーは `expires_in_seconds` を指定して期限付きで発行し、サーバー側のシークレットにだけ保存する。

---

## 3. Anthropic (Claude Console / Claude Platform)

### 3.1 使用量・コスト取得

**Cost API（予算判定はこちらを使う）**

| 項目 | 内容 |
|---|---|
| Method / URL | `GET https://api.anthropic.com/v1/organizations/cost_report` |
| ヘッダ | `x-api-key: <sk-ant-admin01-...>`、`anthropic-version: 2023-06-01`（推奨: `User-Agent: BudgetGuard/1.0 (...)`） |
| クエリ | `starting_at`（必須。RFC 3339）、`ending_at`（任意。RFC 3339、終了を含まない）、`bucket_width`（`"1d"` のみ）、`group_by[]`（`workspace_id` / `description`）、`limit`（1〜31、既定値 7。バケット数を指す）、`page`（`next_page` を渡す） |
| レスポンス | `{ data:[{ starting_at, ending_at, results:[{ amount:string, currency:"USD", cost_type, description, model, workspace_id, token_type, service_tier, context_window, inference_geo }] }], has_more, next_page }` |
| 単位 | `amount` は**セント単位の小数文字列**。例: `"123.45"` は $1.23。数値に変換して 100 で割るとドル |
| 注意 | Priority Tier のコストは cost_report に**含まれない**（usage エンドポイントで追う必要がある）。default workspace の `workspace_id` は `null`。費用のない日も空の `results` を持つバケットとして返る |

出典: https://platform.claude.com/docs/en/api/beta/organization/cost_report/retrieve 、 https://platform.claude.com/docs/en/manage-claude/usage-cost-api

**Usage API（トークン数の補助用）**: `GET /v1/organizations/usage_report/messages`。`bucket_width` は `1m`（最大 1440 バケット）/ `1h`（最大 168）/ `1d`（最大 31）。`group_by[]` には model / workspace_id / api_key_id / service_tier などを指定できる（https://platform.claude.com/docs/en/manage-claude/usage-cost-api）。

- 鮮度: 「通常は API リクエスト完了から 5 分以内に反映されるが、まれにそれより遅れる」。ポーリングは**継続的な利用で 1 分に 1 回まで**（同 usage-cost-api FAQ）。毎時取得なら問題ない。
- 個人アカウントでは Admin API を使えない。Claude Platform on AWS では Usage/Cost API を使えない（同ページ）。

### 3.2 停止アクション

| # | 操作 | Method / URL | Body | 元に戻す方法 |
|---|---|---|---|---|
| 1 | **API キーの無効化** | `POST https://api.anthropic.com/v1/organizations/api_keys/{api_key_id}` | `{"status":"inactive"}` | 同じ URL に `{"status":"active"}` を POST する（`status` の enum に `active` があるため可逆と読める。復帰を明記した記述はない → 未確認） |
| 1' | API キーのアーカイブ | 同上 | `{"status":"archived"}` | 可逆かどうか → 未確認。Budget Guard では**使わない** |
| 2 | 対象キーの列挙 | `GET /v1/organizations/api_keys?status=active&workspace_id=<wrkspc_...>&limit=1000&after_id=...`（`has_more`/`last_id` でページング。https://platform.claude.com/docs/en/api/beta/organization/api_keys/list） | — | — |
| 3 | ワークスペースのアーカイブ | `POST /v1/organizations/workspaces/{workspace_id}/archive` | — | 元に戻す API はドキュメントにない → 元に戻せない前提で扱う |
| 4 | 組織またはワークスペースの spend limit | `POST /v1/organizations/spend_limits` | `{"scope":{"type":"workspace","workspace_id":"wrkspc_..."},"amount":"<cents>","period":"monthly"}` | 金額を引き上げる。ただし Console 組織での organization / workspace 上限の **API 設定は early access preview**（アカウントチームへの申請が必要） |

出典: https://platform.claude.com/docs/en/api/beta/organization/api_keys/update 、 https://platform.claude.com/docs/en/manage-claude/admin-api 、 https://platform.claude.com/docs/en/api/beta/organization/workspaces/archive 、 https://platform.claude.com/docs/en/api/beta/organization/spend_limits/set 、 https://platform.claude.com/docs/en/manage-claude/spend-limits-api

- spend limit に達すると、リクエストは HTTP 400 `invalid_request_error`（"You have reached your specified ... API usage limits"）で失敗する。上限を引き上げるか外すと復帰する（同 spend-limits 関連ページ）。
- Spend Limits API の GA 部分は **Claude Enterprise 専用**（Console では利用できない。https://platform.claude.com/docs/en/manage-claude/spend-limits-api）。
- 方針: 100% 到達時は、対象ワークスペースの active なキーを全件 `inactive` にする。変更したキー ID は保存しておき、復帰時に `active` に戻す。

### 3.3 最小権限

- Console の Admin API key（`sk-ant-admin01-...`）には**スコープの選択がなく**、常に全権限を持つ。作成できるのは admin ロールのメンバーだけ（https://platform.claude.com/docs/en/manage-claude/admin-api-keys）。
- そのため、使用量の取得とキーの無効化には**同じ Admin キー**を使うことになる。読み取り専用のキーは Console には存在しない。
- ほかの認証手段: `org:admin` スコープの OAuth トークン、またはワークスペースにスコープされていない personal / service account キー（紐づくアカウントと同じ権限を持つ）（https://platform.claude.com/docs/en/manage-claude/admin-api）。
- Enterprise 組織の場合は `read:analytics` / `read:spend_limits` / `write:spend_limits` などのスコープ付きキーがあり、別の API（Analytics API）を使う（https://platform.claude.com/docs/en/manage-claude/admin-api-keys）。

---

## 4. 横断まとめ

| | 使用量の粒度 | 金額の単位 | 読み取り専用キー | 可逆な停止 | ネイティブ上限 |
|---|---|---|---|---|---|
| Vercel | 1 日、JSONL | ドル（number。例では string） | なし（ロール依存） | pause / unpause | Spend Management + webhook |
| OpenAI | 1 日、cursor paging | ドル（number） | なし | spend_limit の POST / DELETE | org / project のハード上限 |
| Anthropic | 1 日（cost）、1m〜（usage） | **セント（文字列）** | なし（Console） | api_key の status 変更 | Console は early access |

---

## 5. 未確認リスト

1. Vercel: `/v1/billing/charges` の反映遅延とデータ鮮度。
2. Vercel: billing charges の合計が Spend Management の「予算」対象額（Pro クレジット超過分）とどう対応するか。
3. Vercel: `BilledCost` の実際の JSON 型（スキーマは number、例は string）。
4. Vercel: Project スコープのトークンで `/v1/billing/charges` を呼べるか（team-level resource なので拒否される可能性が高い）。
5. Vercel: pause / unpause API の必要ロール（ダッシュボードの要件が Owner / Member / Project Admin であることだけは記載あり）。読み取り専用トークンや細かいスコープが存在するか。
6. Vercel: Spend Management の予算を REST API で設定するエンドポイントがあるか。Hobby プランで billing charges を使えるか。
7. OpenAI: Costs / Usage API のデータ鮮度とレイテンシ。
8. OpenAI: Admin API key を作成できるロール（RBAC 表からは Org owner と推測できるが明記はない）。読み取り専用 Admin キーがあるか（なさそう）。
9. OpenAI: 現在額より低い `threshold_amount` を設定したとき、すぐに強制が始まるか。
10. OpenAI: アーカイブしたプロジェクトを元に戻す手段（API にはない）。
11. Anthropic: `status:"inactive"` を `"active"` に戻せることの明示的な保証。`"archived"` が元に戻せないかどうか。
12. Anthropic: ワークスペースのアーカイブを解除できるか。
13. Anthropic: Console 組織で organization / workspace の spend limit API の early access を受けたときの実際の挙動。

---

## 6. 実装用サマリ（TypeScript 向け）

```ts
// ===== Vercel =====
// Fetch (MTD): JSONL, gzip
GET https://api.vercel.com/v1/billing/charges?from=${monthStartISO}&to=${nowISO}&teamId=${TEAM_ID}
headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Accept-Encoding": "gzip" }
// parse: body.split("\n").filter(Boolean).map(JSON.parse)
//   per line: Number(line.BilledCost)  (USD, number|string), line.BillingCurrency === "USD"
//   optional filter: line.ChargeCategory === "Usage"; per-project: line.Tags.ProjectId
// total = Σ Number(BilledCost)   [USD]
// Stop:
POST https://api.vercel.com/v1/projects/${projectId}/pause?teamId=${TEAM_ID}    // 200, empty body
// Undo:
POST https://api.vercel.com/v1/projects/${projectId}/unpause?teamId=${TEAM_ID}
// Optional inbound webhook (Spend Mgmt): verify
//   hex(HMAC_SHA1(secret, rawBody)) === req.headers["x-vercel-signature"]  (timingSafeEqual)
//   body: { budgetAmount, currentSpend, teamId, thresholdPercent }

// ===== OpenAI =====
// Fetch (MTD): paginate while has_more
GET https://api.openai.com/v1/organization/costs?start_time=${monthStartUnixSec}&end_time=${nowUnixSec}&bucket_width=1d&limit=31[&group_by[]=project_id][&page=${next_page}]
headers: { Authorization: `Bearer ${OPENAI_ADMIN_KEY}` }
// parse: $.data[*].results[*].amount.value  (USD number), .amount.currency === "usd"
//        $.data[*].results[*].project_id (when grouped), $.has_more, $.next_page
// total = Σ amount.value   [USD]
// Stop (reversible, preferred):
POST https://api.openai.com/v1/organization/projects/${projectId}/spend_limit
headers: { Authorization: `Bearer ${OPENAI_ADMIN_KEY}`, "Content-Type": "application/json" }
body: { threshold_amount: <int cents ≥1>, currency: "USD", interval: "month" }
// verify: $.enforcement.status === "enforcing"   (GET same URL)
// Undo: DELETE https://api.openai.com/v1/organization/projects/${projectId}/spend_limit
//       (or POST with higher threshold_amount / restore saved previous value)
// Org-wide variant: /v1/organization/spend_limit (same body)

// ===== Anthropic =====
// Fetch (MTD): paginate while has_more
GET https://api.anthropic.com/v1/organizations/cost_report?starting_at=${monthStartRFC3339}&ending_at=${tomorrowStartRFC3339}&bucket_width=1d&limit=31[&group_by[]=workspace_id][&page=${next_page}]
headers: { "x-api-key": ANTHROPIC_ADMIN_KEY, "anthropic-version": "2023-06-01" }
// parse: $.data[*].results[*].amount  (decimal STRING in CENTS) → Number(x)/100 = USD
//        $.data[*].results[*].currency === "USD", .workspace_id (null = default ws)
//        $.has_more, $.next_page
// total = Σ Number(amount) / 100   [USD]   (excludes Priority Tier)
// Stop (per key; list first):
GET  https://api.anthropic.com/v1/organizations/api_keys?status=active&workspace_id=${WS}&limit=1000[&after_id=${last_id}]
//   parse: $.data[*].id, $.data[*].status, $.data[*].scope.workspace_id, $.has_more, $.last_id
//   (source: https://platform.claude.com/docs/en/api/beta/organization/api_keys/list ; limit 1–1000, default 20)
POST https://api.anthropic.com/v1/organizations/api_keys/${apiKeyId}
headers: { "x-api-key": ANTHROPIC_ADMIN_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
body: { status: "inactive" }       // verify: $.status === "inactive"
// Undo: same POST with { status: "active" }   (persist the list of keys we disabled)
// NEVER use status:"archived" or workspace archive for auto-stop (irreversible / unconfirmed)
```
