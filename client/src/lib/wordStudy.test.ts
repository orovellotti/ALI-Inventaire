import assert from "node:assert/strict";
import test from "node:test";
import { buildWordStudyDocument, studyMarkdownToWordHtml } from "./wordStudy";

test("Word Markdown handles headings, paragraphs, emphasis, lists and tables", () => {
  const html = studyMarkdownToWordHtml("# Study\r\n\r\nFirst **bold**\r\ncontinued *italic*\r\n\r\n- One\r\n* Two\r\n## Evidence\r\n| Taxon | Level |\r\n| --- | --- |\r\n| Testus | Moderate |");
  assert.match(html, /<h1>Study<\/h1>/);
  assert.match(html, /<p>First <strong>bold<\/strong> continued <em>italic<\/em><\/p>/);
  assert.match(html, /<ul>\n<li>One<\/li>\n<li>Two<\/li>\n<\/ul>\n<h2>Evidence<\/h2>/);
  assert.match(html, /<thead><tr><th>Taxon<\/th><th>Level<\/th><\/tr><\/thead><tbody>/);
  assert.match(html, /<tr><td>Testus<\/td><td>Moderate<\/td><\/tr>\n<\/tbody><\/table>$/);
});

test("model HTML and document title cannot inject markup", () => {
  const document = buildWordStudyDocument({
    generatedText: "# <script>alert(1)</script>\n\n<img src=x onerror=alert(1)> & data",
    subject: "</title><script>bad()</script>",
    toponym: "Étang / <test>",
  });
  assert.ok(!document.html.includes("<script>"));
  assert.ok(!document.html.includes("<img"));
  assert.match(document.html, /&lt;script&gt;/);
  assert.match(document.html, /&amp; data/);
  assert.equal(document.filename, "biodiversity-desk-study-ali-etang-test.doc");
  assert.equal(document.mimeType, "application/msword;charset=utf-8");
});

test("only generated text is exported, with limitations and expert referral intact", () => {
  assert.throws(() => buildWordStudyDocument({ generatedText: " ", subject: "Study" }), /Generate/);
  const document = buildWordStudyDocument({ generatedText: "Generated study body", subject: "Study" });
  assert.match(document.html, /<p>Generated study body<\/p>/);
  assert.match(document.html, /regulatory completeness is not guaranteed/);
  assert.match(document.html, /Natural Solutions experts/);
  assert.match(document.html, /href="https:\/\/natural-solutions.eu"/);
  assert.equal(document.filename, "biodiversity-desk-study-ali-site.doc");
});