# リモート MCP サーバーの公開手順（ホスティング）

> この文書は、Kotomark のリモート MCP サーバー（`src/server/`）を、オーナーがホスティング先を決めたあと**コマンド1本で公開できる**ようにするための手順書です。
> まだアカウント作成・デプロイ・支払いは何もしていません。料金はすべて**公開されている料金表からの見積もり**です（2026-10-09 時点）。

---

## 1. オーナーが決めること・用意すること

ここは準備できません。オーナーの判断と、オーナー名義の契約が必要です。

| # | 決めること／用意するもの | 選択肢・メモ |
|---|---|---|
| 1 | **ホスティング先** | **Fly.io**（東京 `nrt`、アクセスが無いと自動停止、従量課金）か **Render**（シンガポール、常時起動、定額に近い）。比較は「4. 月額の見積もり」 |
| 2 | **アカウント** | 選んだサービスのアカウント（会社名義を推奨）。Render は GitHub か GitLab の連携も必要 |
| 3 | **支払い方法** | クレジットカード。Fly.io は試用期間（最大2時間の稼働、または7日）が過ぎるとカードが必須。Render はディスクを使うため有料プランが必須 |
| 4 | **ドメイン**（任意） | 無しでも `https://<app>.fly.dev` や `https://<name>.onrender.com` で動きます。独自ドメインを使うなら、取得して DNS を設定 |
| 5 | **秘密情報の生成と保管** | `KOTOMARK_ENCRYPTION_KEY` を作り、**ホスティング先とは別の場所**（パスワード管理ツールなど）にも保管する。なくすと保存済みの用語集は二度と復号できません |
| 6 | **利用者へのトークン配布** | 誰にどのプラン（solo / studio）でトークンを発行するか。トークンは発行時に1回だけ表示されるので、安全な経路で渡す |
| 7 | **サーバー側判断（任意、既定オフ）** | `KOTOMARK_ANTHROPIC_API_KEY` を入れると当社の API キーで判断機能が有効になり、文字列が Anthropic に送られます。**有効にする前に** `docs/data-policy.md` と利用規約の改訂が必要。初回の公開では設定しません |

## 2. もう準備できていること

| ファイル | 内容 |
|---|---|
| `Dockerfile` | 3段構成（ビルド：`npm ci` + `tsc` + CLI の bundle／本番用の依存だけを入れる段／実行：`node:22-bookworm-slim`）。`NODE_ENV=production`、`PORT=8080`、`HOST=0.0.0.0`、`KOTOMARK_DATA_DIR=/data`。`HEALTHCHECK` 付き |
| `deploy/docker-entrypoint.sh` | 起動時に、ホストが root 所有でマウントするボリューム `/data` を `node` ユーザー（uid 1000）の所有に変えてから、root 権限を捨ててサーバーを起動します。**サーバー本体は root で動きません** |
| `deploy/kotomark-cli.sh` | コンテナ内の `kotomark` コマンド。root で実行しても `node` ユーザーとして動くので、作った `tokens.json` をサーバーが読めます |
| `.dockerignore` | ビルドに必要なもの（`package*.json`、`tsconfig.json`、`scripts/build-cli.mjs`、`src/`、`deploy/*.sh`）以外を除外 |
| `deploy/fly.toml.example` | Fly.io：東京 `nrt`、自動停止／自動起動、`/healthz` のヘルスチェック、`/data` のボリューム、1台構成 |
| `deploy/render.yaml.example` | Render：Docker の Web サービス（Starter）、シンガポール、`/healthz`、1GB ディスク、1台構成、手動デプロイ |
| `GET /healthz` | 認証なしで `200 {"ok":true}` を返します。本文を読まず、アクセスログにも書きません（数秒おきの確認でログが埋まらないように） |
| 本番の安全装置 | `NODE_ENV=production` のとき、トークンが1つも無い、または `KOTOMARK_ENCRYPTION_KEY` が無いと**起動しません**（`test/server-boot.test.ts` で確認） |

### 環境変数

| 変数 | 必須 | 値 |
|---|---|---|
| `KOTOMARK_ENCRYPTION_KEY` | **必須（秘密）** | 32バイトを base64 にしたもの。`openssl rand -base64 32` で作成 |
| `KOTOMARK_DATA_DIR` | 設定済み | `/data`（ボリューム／ディスクのマウント先）。`tokens.json` と暗号化済みの用語集が入ります |
| `KOTOMARK_API_TOKENS` | 任意（秘密） | カンマ区切りのトークン。**初回起動用**に1つ入れておくと、起動後にコンテナ内で利用者用トークンを作れます（理由は下の注意）。この方式のトークンは `env-1` などの名前で studio 扱い |
| `KOTOMARK_ANTHROPIC_API_KEY` | 設定しない | 既定オフ。上の表の #7 を参照 |
| `PORT` / `HOST` | 設定済み | `8080` / `0.0.0.0` |

> **注意（初回のトークン）：** 本番ではトークンが無いとサーバーが起動しません。一方、利用者用トークンはコンテナの中で `kotomark token create` を実行して作ります。この「卵と鶏」を避けるため、初回は `KOTOMARK_API_TOKENS` に管理用のトークンを1つ入れて起動し、中で利用者用トークンを作ります。利用者用トークンが1つ以上できたら、`KOTOMARK_API_TOKENS` は削除して構いません（`tokens.json` のトークンだけで起動します）。

---

## 3. 公開手順

### 共通：秘密情報を作る（手元で）

```bash
openssl rand -base64 32      # → KOTOMARK_ENCRYPTION_KEY。パスワード管理ツールにも保存
openssl rand -base64 24      # → 初回用の KOTOMARK_API_TOKENS（管理用。後で削除）
```

### A. Fly.io（推奨：東京、使わない時間は停止）

前提：`flyctl` を入れて `fly auth login` 済み（アカウントとカード登録はオーナー）。

```bash
cp deploy/fly.toml.example fly.toml           # app = "..." を空いている名前に変更
fly apps create <app>                          # 例: kotomark-mcp
fly volumes create kotomark_data --region nrt --size 1
fly secrets set KOTOMARK_ENCRYPTION_KEY='<生成した鍵>' KOTOMARK_API_TOKENS='<初回用トークン>'
fly deploy --ha=false                          # Dockerfile からビルドして公開（1台だけ）
fly scale count 1                              # 念のため1台に固定
```

利用者用トークンの発行（マシンが停止中なら、先に `curl https://<app>.fly.dev/healthz` で起こす）：

```bash
fly ssh console -C "kotomark token create alice --plan solo --label pilot"   # トークンは1回だけ表示
fly ssh console -C "kotomark token list"
fly ssh console -C "kotomark token revoke alice"
# 利用者用トークンができたら初回用トークンを削除（再デプロイされます）
fly secrets unset KOTOMARK_API_TOKENS
```

### B. Render（常時起動、シンガポール）

前提：このリポジトリを GitHub か GitLab に push 済みで、Render のアカウントと連携済み（オーナー）。

```bash
cp deploy/render.yaml.example render.yaml      # リポジトリ直下に置いて commit / push
```

1. Render の画面で **New → Blueprint** を選び、リポジトリを指定します。
2. `sync: false` の項目（`KOTOMARK_ENCRYPTION_KEY`、`KOTOMARK_API_TOKENS`）の入力を求められるので、生成した値を入れます。
3. 作成するとビルドと公開が始まります（`autoDeploy: false` なので、以後は画面の **Manual Deploy** で更新）。
4. 利用者用トークンは、サービスの **Shell** タブ（または SSH）で発行します：
   ```bash
   kotomark token create alice --plan solo --label pilot
   ```
5. 利用者用トークンができたら、Environment から `KOTOMARK_API_TOKENS` を削除します。

> ディスクを付けたサービスは、デプロイのたびに旧インスタンスを止めてから新しいものを起動します（数十秒止まります）。Render の仕様です。

### C. その他（任意の Docker ホスト）

```bash
docker build -t kotomark .
docker run -d -p 8080:8080 -v kotomark-data:/data \
  -e KOTOMARK_ENCRYPTION_KEY='<鍵>' -e KOTOMARK_API_TOKENS='<初回用トークン>' kotomark
docker exec -it <container> kotomark token create alice --plan solo
```

TLS（HTTPS）は手前のリバースプロキシで必ず終端してください。サーバー自体は HTTP だけを話します。

---

## 4. 月額の見積もり（2026-10-09 時点・見積もり）

> 以下は公開されている料金表からの**見積もり**です。税、為替、料金改定で変わります。契約前に必ず各ページで確認してください。

| 項目 | Fly.io（東京 `nrt`、shared-cpu-1x / 512MB） | Render（Starter、シンガポール） |
|---|---|---|
| 計算資源 | 常時起動なら約 **$4.8/月**（`iad` の $3.69/月 × 東京の割増率 約1.31 からの試算）。自動停止なので、実際は稼働時間に比例して減る | **$7/月**（Starter：512MB / 0.5 CPU） |
| 停止中の課金 | rootfs $0.15/GB/月 | 停止しない（常時課金） |
| ボリューム／ディスク 1GB | $0.15/月 | $0.25/月 |
| 転送量 | アジア太平洋の送信 $0.04/GB。受信は無料 | Hobby プランは月 5GB まで込み、超過は $0.15/GB |
| プラン料金 | なし（無料枠も無し。試用後はカード必須） | Hobby $0/月（Pro は $25/月。今は不要） |
| HTTPS 証明書 | 10個まで無料（`*.fly.dev` も可） | 込み |
| **合計の目安** | **約 $1〜6/月**（試験運用で稼働が少なければ下限付近、常時アクセスがあれば上限付近） | **約 $7.25〜8/月** |
| 独自ドメイン（任意） | 別途、ドメイン代（年額） | 同左 |

出典（2026-10-09 に参照）：

- Fly.io 料金：<https://docs.fly.io/about/pricing>（shared-cpu-1x 512MB $3.69/30日（`iad`）、東京の割増率 1.307692308、ボリューム $0.15/GB/月、停止中 rootfs $0.15/GB/月、アジア太平洋の送信 $0.04/GB、試用は最大2時間または7日）
- Render 料金：<https://render.com/pricing>（Starter $7/月。ページの表が動的に描画されるため、契約前に画面で再確認してください）
- Render のディスクと帯域：<https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses>（ディスク $0.25/GB/月、Hobby $0 で 5GB、Pro $25、超過 $0.15/GB）
- Render のディスク仕様：<https://render.com/docs/disks>（有料サービスのみ、1インスタンス専用、ゼロダウンタイムのデプロイ不可）
- Render のリージョン：<https://render.com/docs/regions>（オレゴン、オハイオ、バージニア、フランクフルト、シンガポール。東京は無し）

**選び方の目安：** 試験運用（パイロット）で利用者が少ないうちは、日本から近く、使わない時間は停止して安い **Fly.io** が向いています。停止からの起動に数秒かかるのが気になる場合や、請求額を一定にしたい場合は Render（または Fly.io で `min_machines_running = 1`）。

---

## 5. セキュリティのチェックリスト

- [ ] **TLS はホスト側で。** Fly.io は `force_https = true`、Render は自動で HTTPS。サーバーを HTTP のまま直接インターネットに出さない
- [ ] **トークン：** 利用者ごとに `kotomark token create` で発行（保存されるのは SHA-256 のハッシュだけ）。初回用の `KOTOMARK_API_TOKENS` は使い終わったら削除。退会・漏えい時は `kotomark token revoke`
- [ ] **暗号化鍵のバックアップ：** `KOTOMARK_ENCRYPTION_KEY` をホスティング先以外にも保管。鍵をなくすと用語集は復号できない。鍵をリポジトリ、チャット、チケットに貼らない
- [ ] **データのバックアップ：** Fly.io はボリュームのスナップショットが自動（最初の 10GB/月は無料）。Render はディスクのスナップショット機能を確認。どちらも中身は暗号化済みの用語集と `tokens.json`（ハッシュ）だけ。削除期限は `docs/data-policy.md` の「公開前の課題」に従って決める
- [ ] **ログの方針：** ログに出るのは `POST /mcp 200 user=alice 12ms` の形式だけ。**台本・用語集・ファイル名などの中身は書きません**（`test/server.test.ts` で確認）。`/healthz` はログに出しません。ホスト側のログ保存期間を、データポリシーの案（30日）に合わせる
- [ ] **1台だけで動かす：** 利用制限（回数・行数）はメモリ上にあり、ボリュームも1台専用。台数を増やすと制限が台数分ゆるくなる。Fly.io は `fly scale count 1`、Render は `numInstances: 1`。再起動すると当日の利用量はリセットされる
- [ ] **サーバー側判断はオフのまま：** `KOTOMARK_ANTHROPIC_API_KEY` は設定しない
- [ ] **依存パッケージの確認：** 公開前に `npm audit --omit=dev` を実行

---

## 6. 公開後の確認

`<URL>` は `https://<app>.fly.dev` や `https://<name>.onrender.com` に置き換えます。

```bash
# 1) ヘルスチェック（認証なしで 200）
curl -i <URL>/healthz
# → HTTP/2 200 … {"ok":true}

# 2) トークン無しの MCP 初期化（401 になること）
curl -i -X POST <URL>/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
# → HTTP/2 401 {"error":"unauthorized"}

# 3) トークン付きの MCP 初期化（200 で serverInfo.name が "kotomark"）
curl -s -X POST <URL>/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H "authorization: Bearer $KOTOMARK_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# 4) Claude Code のプラグインから接続
export KOTOMARK_MCP_URL=<URL>/mcp
export KOTOMARK_TOKEN=<発行したトークン>
claude --plugin-dir ./plugin
# Claude Code の中で /mcp を開き、kotomark が connected になっていることを確認。
# samples/ja-en を対象に /lqa-check を実行して、レポートが返ることを確認。

# 5) ログに中身が出ていないことを確認
fly logs            # Render は画面の Logs
# → "POST /mcp 200 user=alice 18ms" のような行だけであること
```

## 7. ローカルでの事前確認（実施済み）

Docker が使えない環境だったため、Dockerfile と同じ手順（クリーンな `npm ci` → `npm run build`、別ディレクトリで `npm ci --omit=dev`、`dist/` と本番用 `node_modules` だけを組み合わせる）を手元で再現し、次を確認しました。

- `NODE_ENV=production PORT=8899` で `0.0.0.0:8899` に bind
- トークン無しでは起動しない（終了コード 1）
- `/healthz` → 200、ログに出ない
- MCP `initialize`：トークン無し／誤ったトークン → 401、`KOTOMARK_API_TOKENS` のトークンと `kotomark token create` で作ったトークン → 200、`tools/list` で9ツール
- `HEALTHCHECK` のコマンドが、起動中は 0、停止中は 1 を返す

Docker が使える環境では、`docker build -t kotomark .` のあと「3-C」の `docker run` で同じ確認をしてください。
