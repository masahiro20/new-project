import { inlineRuns, parseBlocks } from "@/lib/markdown";

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {inlineRuns(line).map((r, j) => (r.bold ? <strong key={j}>{r.text}</strong> : <span key={j}>{r.text}</span>))}
        </span>
      ))}
    </>
  );
}

/**
 * `headingOffset` shifts Markdown heading levels: generated documents use `#` for the document title,
 * which sits under the page's own h1/h2 (offset 1); guide bodies start at `##` (offset 0).
 */
export default function MarkdownView({ markdown, headingOffset = 1 }: { markdown: string; headingOffset?: 0 | 1 }) {
  return (
    <div className="doc">
      {parseBlocks(markdown).map((b, i) => {
        switch (b.type) {
          case "heading": {
            const H = `h${Math.max(2, b.level + headingOffset)}` as "h2" | "h3" | "h4";
            return <H key={i}><Inline text={b.text} /></H>;
          }
          case "paragraph":
            return <p key={i}><Inline text={b.text} /></p>;
          case "quote":
            return <blockquote key={i}><Inline text={b.text} /></blockquote>;
          case "rule":
            return <hr key={i} />;
          case "list": {
            const L = b.ordered ? "ol" : "ul";
            return <L key={i}>{b.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}</L>;
          }
          case "table":
            return (
              <div className="table-wrap" key={i}>
                <table>
                  <thead>
                    <tr>{b.rows[0]?.map((c, j) => <th key={j}><Inline text={c} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.slice(1).map((row, r) => (
                      <tr key={r}>{row.map((c, j) => <td key={j}><Inline text={c} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
