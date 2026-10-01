/**
 * Conservative name-only identity: remove recognizable authors, never truncate
 * to a binomial. Rank markers, infra-specific epithets and hybrids remain part
 * of the identity. Ambiguous lower-case tokens are retained rather than merged.
 */
export function normalizeTaxonIdentity(name: string): string {
  const tokens = name.normalize("NFC").replace(/\([^)]*\)/g, " ").trim().split(/\s+/);
  const kept: string[] = [];
  let inAuthor = false;
  let hasGenus = false;
  const ranks: Record<string, string> = {
    "ssp.": "subsp.", ssp: "subsp.", subsp: "subsp.",
    "subsp.": "subsp.", var: "var.", "var.": "var.", "f.": "f.", forma: "f.",
  };
  for (const token of tokens) {
    if (token === "×" || token === "x") {
      kept.push("×");
      continue;
    }
    if (!hasGenus) {
      kept.push(token);
      hasGenus = true;
      continue;
    }
    // In botany the species author can precede an infra-specific rank.
    if (ranks[token]) {
      kept.push(ranks[token]);
      inAuthor = false;
      continue;
    }
    if (/\d/.test(token) || /^[A-ZÀ-Þ]/.test(token) ||
        ["ex", "in", "auct.", "sensu"].includes(token) || /[,&]/.test(token)) {
      inAuthor = true;
      continue;
    }
    if (inAuthor) continue;
    kept.push(token);
  }
  return kept.join(" ").toLowerCase();
}