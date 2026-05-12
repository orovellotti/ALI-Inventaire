const ALI_SEARCH = "https://alispecies.io/api/taxons/search";
const cache = new Map<string, { cdNom: number; lbNom: string } | null>();

interface AliHit {
  cdNom: number;
  cdRef: number;
  lbNom: string;
  rang: string;
}

export async function resolveAliTaxon(name: string): Promise<{ cdNom: number; lbNom: string } | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const r = await fetch(`${ALI_SEARCH}?q=${encodeURIComponent(name)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      cache.set(key, null);
      return null;
    }
    const hits = (await r.json()) as AliHit[];
    if (!Array.isArray(hits) || hits.length === 0) {
      cache.set(key, null);
      return null;
    }
    const lower = key;
    const exactSpecies = hits.find(h => h.rang === "ES" && h.lbNom.toLowerCase() === lower);
    const anySpecies = hits.find(h => h.rang === "ES");
    const best = exactSpecies || anySpecies || hits[0];
    const result = { cdNom: best.cdRef || best.cdNom, lbNom: best.lbNom };
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}
