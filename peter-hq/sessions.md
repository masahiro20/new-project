# リーダーセッション台帳

## 追加（2026-10-08 23:39 JST〜）
| チーム | リーダー | セッションID | 作業ブランチ | 任務 |
|---|---|---|---|---|
| P7 Anime | Hikaru | session_01D1Y6NZQsbsgg7YkQhtL5rQ | peter/p7-anime | オリジナルアニメIP（企画・バイブル・第1話・ピッチ） |
| P8 Mech Game | Rook | session_01ETmk7FEb5Vaiay9XiHdHTM | peter/p8-mech-game | 四足ロボット操縦ゲームの遊べる試作 |
| HQ Midas | Midas | session_01TLo2RFuUc2jN6aZ3JRyc7o | peter/hq-revenue | 収益戦略（収益地図・30日計画） |
| HQ Otto | Otto | session_01K8Eqy9VDKh83hbaufG3GpE | peter/hq-office | 仮想オフィス v6 |

## デモ・スプリント（2026-10-08 22:48 JST〜）
各チームはサブエージェントで並列チームを組み、オーナーが触れる非公開デモを作る。
| プロジェクト | リーダー | セッションID | 作業ブランチ | 任務 |
|---|---|---|---|---|
| P0 減算ゼロ | Mina | session_019QzkHuvo1SuxAPiKCHkDhu | peter/p0-genzan-zero | 解説ページ11本＋書類サンプル |
| P1 Yuragi | Forge | session_01UxC1ZasACaQ4epeoSQvkGr | peter/p1-skillforge | ブラウザで試せるデモ |
| P2 Signal Lab | Vega | session_015XigFVCQSSHY1yMdRTDpZK | peter/p2-signal-lab | Budget Guard 体験デモ＋Model Switch Calculator |
| P3 Pitch | Kana | session_019Z6KhuwmBpJjCfHnF3YVMF | peter/p3-pitch | 録音ファイルで試せるデモ |
| P4 Collector Lens | Ren | session_01C7QqXQZ6ibhgnM1DXANYZi | peter/p4-collector-lens | 出品文を貼って試せるデモ |
| P5 Atlas | Atlas | session_01HsRA6TcDdEV3mNchxr2yLP | peter/p5-atlas | Allowlist Builder デモ |

心拍は1時間ごと（毎時49分）に変更。承認ボックスは仮想オフィスの db（approvals）。

## ステージ2（2026-10-08 心拍 #2 から）
| プロジェクト | リーダー | セッションID | 作業ブランチ | 任務 |
|---|---|---|---|---|
| P0 減算ゼロ | Mina | session_01RL3RUSggxNbqRmV9aVJseX | peter/p0-genzan-zero | 現状点検 |
| P1 SkillForge | Forge | session_011RR4JWn4dSd4nrMt8CNcB6 | peter/p1-skillforge | 台本の一貫性チェックの試作 |
| P2 Signal Lab | Vega | session_01Eea6nhmQahZC3yPtGWnzne | peter/p2-signal-lab | テンプレートと Budget Guard の試作 |
| P3 Pitch | Kana | session_01SfGCqqeCYAitznCGR1oNCV | peter/p3-pitch | ブラウザ版デモ |
| P4 Collector Lens（仮称） | Ren | session_01NJNGrT8Xc92wa3mLByZvwL | peter/p4-collector-lens | Listing Decoder 拡張 |
| P5 Atlas | Atlas | session_01W5ftR6QKRxS65AovywdSdj | peter/p5-atlas | 100件試験と Allowlist Builder |
| P6 Fleet | Otto | （撤退。HQ Ops） | — | — |

## ステージ1（完了）
| プロジェクト | リーダー | セッションID | 開始 | 現在の任務 |
|---|---|---|---|---|
| P1 SkillForge | Forge | session_01XDcEvST9M8CNdkCQE3QPeJ | 2026-10-08 | ステージ1 検証 |
| P2 Signal Lab | Vega | session_01RVkseipGDCkjF11ZR3Sf3F | 2026-10-08 | ステージ1 検証 |
| P3 Pitch | Kana | session_01NU5JmC356Cy3GRzSQFPERJ | 2026-10-08 | ステージ1 検証 |
| P4 Mercari Lens（仮称） | Ren | session_01ExnRZQSzGENVMiY5TSsTab | 2026-10-08 | ステージ1 検証 |
| P5 Atlas | Atlas | session_01QAp8KSSP8GBLN89YCLDmFv | 2026-10-08 | ステージ1 検証 |
| P6 Fleet | Otto | session_01Rf4ipE2wruh4LNkQPK1Ez1 | 2026-10-08 | ステージ1 検証 |
| P0 減算ゼロ | Mina | 未起動（次の心拍で起動） | 2026-10-08 | 現状確認 |
| INTEL | Iris | ピーター本部セッション内（毎晩 21:57 JST の定例で実行） | 2026-10-08 | 毎晩の報告 |

定例ルーティン:
- `trig_017EWz43ykgxRDhvbpRWoY9T`（Peter Nightly Brief、毎日 21:57 JST）
- `trig_01JLW6FjHHn6NHxdEqFKGhkV`（Peter Heartbeat、2時間ごと・毎時50分）

仮想オフィスのデータ（ArtifactData）: `agents/<id>`、`hq/heartbeat`、`hq/log`

一時保存ブランチ（専用リポジトリができるまで）: `hq/p2-signal-lab`、`hq/p5-atlas`

バーチャルオフィス: https://claude.ai/artifact/AbCH8bC39PRXNWgg5tt5sG（ソース: office/index.html）
