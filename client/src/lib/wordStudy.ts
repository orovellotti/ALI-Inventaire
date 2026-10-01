function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Deliberately small Markdown subset; model-supplied HTML is always escaped. */
export function studyMarkdownToWordHtml(markdown: string): string {
  const inline = (value: string) =>
    escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listOpen = false;
  let tableOpen = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listOpen) html.push("</ul>");
    listOpen = false;
  };
  const closeTable = () => {
    if (tableOpen) html.push("</tbody></table>");
    tableOpen = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index].trim();
    const heading = rawLine.match(/^(#{1,3})\s+(.+)$/);
    const bullet = rawLine.match(/^[-*]\s+(.+)$/);
    const cells = rawLine.startsWith("|") && rawLine.endsWith("|")
      ? rawLine.slice(1, -1).split("|").map((cell) => cell.trim())
      : null;
    const separator = /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/;
    const nextIsSeparator = separator.test(lines[index + 1]?.trim() ?? "");

    if (!rawLine) {
      flushParagraph();
      closeList();
      closeTable();
    } else if (heading) {
      flushParagraph();
      closeList();
      closeTable();
      html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (bullet) {
      flushParagraph();
      closeTable();
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
    } else if (separator.test(rawLine)) {
      continue;
    } else if (cells) {
      flushParagraph();
      closeList();
      if (!tableOpen) {
        html.push("<table>");
        if (nextIsSeparator) {
          html.push(`<thead><tr>${cells.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>`);
          tableOpen = true;
          index += 1;
          continue;
        }
        html.push("<tbody>");
        tableOpen = true;
      }
      html.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`);
    } else {
      closeList();
      closeTable();
      paragraph.push(rawLine);
    }
  }
  flushParagraph();
  closeList();
  closeTable();
  return html.join("\n");
}

/** Word-compatible HTML (.doc), not DOCX. No source-results fallback is accepted. */
export function buildWordStudyDocument(input: {
  generatedText: string;
  subject: string;
  toponym?: string;
}) {
  if (!input.generatedText.trim()) throw new Error("Generate the written study before exporting it.");
  const safePlace = (input.toponym || "site")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.subject)}</title>
  <style>
    @page { size: A4; margin: 2.2cm 2cm; }
    body { font-family: Aptos, Calibri, Arial, sans-serif; color: #243b34; font-size: 11pt; line-height: 1.55; }
    h1 { color: #174c3f; font-size: 24pt; line-height: 1.15; margin: 0 0 22pt; padding-bottom: 10pt; border-bottom: 2pt solid #b88945; }
    h2 { color: #1e594a; font-size: 17pt; line-height: 1.25; margin: 24pt 0 9pt; page-break-after: avoid; }
    h3 { color: #46675d; font-size: 13pt; line-height: 1.3; margin: 16pt 0 7pt; page-break-after: avoid; }
    p { margin: 0 0 9pt; text-align: justify; }
    ul { margin: 4pt 0 10pt 18pt; padding: 0; }
    li { margin-bottom: 4pt; }
    table { width: 100%; border-collapse: collapse; margin: 10pt 0 16pt; font-size: 9.5pt; }
    th { color: #fff; background: #1e594a; font-weight: 700; text-align: left; }
    th, td { border: 1px solid #aebdb7; padding: 6pt; vertical-align: top; }
    tr:nth-child(even) td { background: #f4f3ec; }
    .status { padding: 10pt 12pt; border-left: 4pt solid #b88945; background: #f5f2e8; margin: 0 0 22pt; color: #3d524b; font-size: 9.5pt; }
  </style>
</head>
<body>
  <div class="status"><strong>Document status.</strong> Biodiversity desk study based on available documented information. Field investigations and an ecologist's validation are needed before regulatory use; regulatory completeness is not guaranteed.</div>
  ${studyMarkdownToWordHtml(input.generatedText)}
  <h2>Next steps</h2>
  <p>Discuss field surveys and validation with Natural Solutions experts: <a href="https://natural-solutions.eu">https://natural-solutions.eu</a>. This does not guarantee regulatory completeness.</p>
</body>
</html>`;
  return {
    html,
    mimeType: "application/msword;charset=utf-8",
    filename: `biodiversity-desk-study-ali-${safePlace || "site"}.doc`,
  };
}