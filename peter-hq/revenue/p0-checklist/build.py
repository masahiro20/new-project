"""checklist.json から checklist.html・checklist.docx を作り、render-pdf.cjs で PDF にする。

使い方: python3 build.py && node render-pdf.cjs
"""
import html
import json
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor
from reportlab.graphics import renderSVG
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing

HERE = Path(__file__).parent
D = json.loads((HERE / "checklist.json").read_text(encoding="utf-8"))
e = html.escape


def qr_svg(url: str, size: int = 92) -> str:
    w = QrCodeWidget(url)
    x1, y1, x2, y2 = w.getBounds()
    d = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
    d.add(w)
    svg = renderSVG.drawToString(d)
    return svg[svg.index("<svg"):]


def build_html() -> str:
    secs = []
    for s in D["sections"]:
        rows = []
        for it in s["items"]:
            note = f'<div class="note">{e(it["note"])}</div>' if it["note"] else ""
            rows.append(
                f'<tr><td class="box">□</td><td class="item">{e(it["text"])}{note}</td><td class="place"></td></tr>'
            )
        secs.append(f"""
<section class="sec">
  <h2>{e(s["title"])}<span class="tag tag-{e(s["id"])}">{e(s["tag"])}</span></h2>
  <p class="lead">{e(s["lead"])}</p>
  <table>
    <colgroup><col class="c1"><col class="c2"><col class="c3"></colgroup>
    <thead><tr><th>確認</th><th>書類・体制</th><th>保管場所</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
</section>""")
    flow = "".join(f"<li>{e(t)}</li>" for t in D["gensan_flow"]["items"])
    how = "".join(f"<li>{e(t)}</li>" for t in D["how_to_use"])
    src = "".join(f"<li>{e(t)}</li>" for t in D["sources"])
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<title>{e(D["title"])}（{e(D["subtitle"])}）</title>
<style>
@page {{ size: A4; margin: 14mm 14mm 16mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: "IPAPGothic", "IPAGothic", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif; color: #1d2a27; font-size: 9.6pt; line-height: 1.55; margin: 0; }}
header {{ border-bottom: 2px solid #1d2a27; padding-bottom: 5mm; margin-bottom: 4mm; }}
.eyebrow {{ font-size: 8.5pt; color: #0d6b5c; letter-spacing: .08em; }}
h1 {{ font-size: 17pt; margin: 1mm 0 0; }}
.sub {{ font-size: 11pt; font-weight: bold; }}
.meta {{ font-size: 8.5pt; color: #55645f; margin-top: 1.5mm; }}
.how {{ background: #eef5f2; padding: 3mm 4mm; margin-bottom: 4mm; }}
.how ul {{ margin: 0; padding-left: 4.5mm; }}
.sec {{ margin-bottom: 4.5mm; }}
.sec + .sec {{ break-before: auto; }}
h2 {{ font-size: 11.5pt; margin: 0 0 1mm; display: flex; align-items: center; gap: 3mm; break-after: avoid; }}
.tag {{ font-size: 8pt; padding: .3mm 2mm; border: 1px solid #a63a2b; color: #a63a2b; border-radius: 1mm; font-weight: bold; }}
.tag-keikaku {{ border-color: #9a6400; color: #9a6400; }}
.tag-unei {{ border-color: #55645f; color: #55645f; }}
.lead {{ margin: 0 0 1.5mm; color: #3b4945; break-after: avoid; }}
table {{ width: 100%; border-collapse: collapse; }}
col.c1 {{ width: 10mm; }} col.c3 {{ width: 36mm; }}
th {{ font-size: 8pt; color: #55645f; text-align: left; border-bottom: 1px solid #1d2a27; padding: 1mm 1.5mm; }}
td {{ border-bottom: 1px solid #c9d3d0; padding: 1.6mm 1.5mm; vertical-align: top; }}
tr {{ break-inside: avoid; }}
td.box {{ font-size: 13pt; line-height: 1; text-align: center; padding-top: 1.2mm; }}
td.place {{ border-left: 1px dashed #c9d3d0; }}
.note {{ font-size: 8.3pt; color: #55645f; margin-top: .6mm; }}
.flow {{ border: 1.5px solid #1d2a27; padding: 3mm 4mm; margin: 2mm 0 4mm; break-inside: avoid; }}
.flow h2 {{ margin-bottom: 1.5mm; }}
.flow ul {{ margin: 0; padding-left: 4.5mm; }}
.cta {{ display: flex; gap: 5mm; align-items: center; background: #0d6b5c; color: #fff; padding: 4mm 5mm; break-inside: avoid; }}
.cta .qr {{ background: #fff; padding: 1.5mm; flex: none; line-height: 0; }}
.cta h2 {{ color: #fff; font-size: 12.5pt; }}
.cta p {{ margin: 1mm 0 0; }}
.cta .url {{ font-family: monospace; font-size: 9pt; word-break: break-all; }}
.foot {{ font-size: 8pt; color: #55645f; margin-top: 4mm; break-inside: avoid; }}
.foot ul {{ margin: .5mm 0 1.5mm; padding-left: 4.5mm; }}
</style></head>
<body>
<header>
  <div class="eyebrow">{e(D["publisher"])}　{e(D["edition"])}</div>
  <h1>{e(D["title"])}</h1>
  <div class="sub">{e(D["subtitle"])}</div>
  <div class="meta">事業所名：＿＿＿＿＿＿＿＿＿＿＿＿＿＿　確認日：　　年　　月　　日　確認者：＿＿＿＿＿＿＿＿</div>
</header>
<div class="how"><ul>{how}</ul></div>
{''.join(secs)}
<section class="flow"><h2>{e(D["gensan_flow"]["title"])}</h2><ul>{flow}</ul></section>
<section class="cta">
  <div class="qr">{qr_svg(D["check_url"])}</div>
  <div>
    <h2>減算の要件を3分で確認する無料診断</h2>
    <p>虐待防止・身体拘束・BCP などの要件を、質問に答えるだけで確認できます。登録は不要で、入力した内容はサーバーに保存しません。解説ページと書類の見本も無料で使えます。</p>
    <p class="url">{e(D["check_url"])}</p>
  </div>
</section>
<div class="foot">
  <strong>主な根拠</strong><ul>{src}</ul>
  {e(D["disclaimer"])}　発行：{e(D["publisher"])}（{e(D["site"])}）
</div>
</body></html>"""


def build_docx(path: Path) -> None:
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(sec, side, Mm(15))
    st = doc.styles["Normal"]
    st.font.name = "Yu Gothic"
    st.font.size = Pt(9.5)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "Yu Gothic")

    def para(text, size=None, bold=False, color=None, space_after=2):
        p = doc.add_paragraph()
        r = p.add_run(text)
        r.bold = bold
        if size:
            r.font.size = Pt(size)
        if color:
            r.font.color.rgb = RGBColor.from_string(color)
        p.paragraph_format.space_after = Pt(space_after)
        return p

    para(f'{D["publisher"]}　{D["edition"]}', 8.5, color="0D6B5C")
    para(D["title"], 16, True, space_after=0)
    para(D["subtitle"], 11, True)
    para("事業所名：＿＿＿＿＿＿＿＿＿＿　確認日：　　年　　月　　日　確認者：＿＿＿＿＿＿", 8.5, color="55645F", space_after=6)
    for t in D["how_to_use"]:
        doc.add_paragraph(t, style="List Bullet")
    for s in D["sections"]:
        para(f'{s["title"]}　［{s["tag"]}］', 11.5, True, space_after=1).paragraph_format.space_before = Pt(8)
        para(s["lead"], 9, color="3B4945")
        tbl = doc.add_table(rows=1, cols=3)
        tbl.style = "Table Grid"
        hdr = tbl.rows[0].cells
        for c, t in zip(hdr, ("確認", "書類・体制", "保管場所")):
            c.text = t
        for it in s["items"]:
            row = tbl.add_row().cells
            row[0].text = "□"
            row[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            row[1].text = it["text"]
            if it["note"]:
                r = row[1].add_paragraph().add_run(it["note"])
                r.font.size = Pt(8)
                r.font.color.rgb = RGBColor.from_string("55645F")
        for row in tbl.rows:
            row.cells[0].width, row.cells[1].width, row.cells[2].width = Mm(12), Mm(128), Mm(40)
    para(D["gensan_flow"]["title"], 11.5, True, space_after=1).paragraph_format.space_before = Pt(8)
    for t in D["gensan_flow"]["items"]:
        doc.add_paragraph(t, style="List Bullet")
    para("減算の要件を3分で確認する無料診断", 11.5, True, color="0D6B5C", space_after=1).paragraph_format.space_before = Pt(8)
    para("虐待防止・身体拘束・BCP などの要件を、質問に答えるだけで確認できます。登録は不要で、入力した内容はサーバーに保存しません。")
    para(D["check_url"], bold=True)
    para("主な根拠", 8.5, True, space_after=0).paragraph_format.space_before = Pt(6)
    for t in D["sources"]:
        para("・" + t, 8, color="55645F", space_after=0)
    para(D["disclaimer"] + f'　発行：{D["publisher"]}（{D["site"]}）', 8, color="55645F")
    doc.save(path)


(HERE / "checklist.html").write_text(build_html(), encoding="utf-8")
build_docx(HERE / "unei-shidou-checklist-jidou.docx")
print("built checklist.html and unei-shidou-checklist-jidou.docx")
