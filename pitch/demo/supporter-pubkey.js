// 創設サポーターキーの公開鍵と、取り消したキーの通し番号。
//
// scripts/supporter-key.mjs の `init` がこのファイルを書き、`revoke` が取り消しリストを更新します。
// 秘密鍵はリポジトリの外にだけ置きます（docs/supporter-ops.md）。
//
// SUPPORTER_PUBLIC_KEY = null は「未設定」：キー入力欄は「準備中」と表示し、どのキーも
// 何も解除しません（fail closed）。本番の鍵ペアは、秘密鍵を誰が持つかが決まるまで作りません。
// TODO(オーナー・本部): 秘密鍵の保管者を決めてから `init` で本番の鍵ペアを作る。

/** ECDSA P-256 の公開鍵（JWK: { kty: 'EC', crv: 'P-256', x, y }）。null = 未設定。 */
export const SUPPORTER_PUBLIC_KEY = null;

/** 取り消したキーの通し番号（返金・不正な共有など）。 */
export const REVOKED_SERIALS = [];
