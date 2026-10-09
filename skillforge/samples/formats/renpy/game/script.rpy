# サンプル：Ren'Py のゲーム本体（架空の内容、原文は日本語）。
# Kotomark は define の行から話者の表示名を読みます（台詞そのものは tl/ の翻訳ファイルから読みます）。
define l = Character("リゼット", color="#c8c8ff")
define m = Character("ミナ", color="#ffc8c8")
define t = Character("トビアス")
default player = "旅人"

label start:

    scene bg archive
    "灰の書庫には、古い紙の匂いが満ちていた。"
    voice "voice/lisette_001.ogg"
    l "ようこそ、[player]さん。わたくしが{b}書庫番{/b}のリゼットです。"
    m "僕、魔導石を見るのは初めてです！"
    t "俺は暁の騎士団の者だ。"
    extend "\nルーンゲートまで案内する。"
    l "星詠みの記録は、この奥にございます。"

    menu:
        "奥へ進む":
            jump archive
        "[player]の日記を読む":
            jump diary
        "引き返す":
            return
