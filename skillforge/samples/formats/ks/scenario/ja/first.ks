; サンプル：TyranoScript のシナリオ（架空の内容）。日本語の原文。表記の揺れはわざと入れてあります。
[chara_new name=lisette jname=リゼット storage=lisette.png]
*start|書庫にて
[bg storage=archive.jpg time=500]
灰の書庫には、古い紙の匂いが満ちていた。[p]

#リゼット
ようこそ、[emb exp="f.player"]さん。[l][r]
わたくしが書庫番のリゼットです。[p]

#ミナ:happy
僕、[ruby text=ま]魔[ruby text=どう]導[ruby text=せき]石を見るのは初めてです！[p]

#トビアス
俺は暁の騎士団の者だ。[l]
ルーンゲートまで案内する。[p]

[iscript]
f.visited = true;
[endscript]

*stacks|奥の書架
#みな
[ruby text=ほし]星[ruby text=]詠みの記録は、この奥にあるんですか？[p]

#リゼット
ええ。[font color=0xff0000]禁書[resetfont]には触れないでくださいね。[p]

#
二人は書架の奥へと進んだ。[p]
足音だけが静かに響いた。[p]

*choice|分かれ道
[glink text="ついていく" target=*follow]
[glink text="ここで待つ" target=*wait]
[s]
