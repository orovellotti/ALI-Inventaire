const ALI_BASE = "https://alispecies.io";

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface AliSearchHit {
  cd_nom?: number;
  cd_ref?: number;
  lb_nom?: string;
  nom_valide?: string;
  is_reference?: boolean;
  rang?: string;
}

const cache = new Map<string, { url: string; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24;

export async function resolveAliUrl(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return ALI_BASE;

  const cached = cache.get(q.toLowerCase());
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;

  try {
    const url = `${ALI_BASE}/api/taxons/search?q=${encodeURIComponent(q)}&limit=5`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`ali search ${r.status}`);
    const data = await r.json();
    const hits: AliSearchHit[] = Array.isArray(data) ? data : data?.results || data?.hits || [];

    const best =
      hits.find((h) => h.is_reference && h.rang === "ES") ||
      hits.find((h) => h.is_reference) ||
      hits[0];

    if (!best) throw new Error("no hit");

    const cdNom = best.cd_ref ?? best.cd_nom;
    if (!cdNom) throw new Error("no cd_nom");

    const name = best.nom_valide || best.lb_nom || q;
    const slug = slugify(name);
    const finalUrl = slug
      ? `${ALI_BASE}/taxon/${cdNom}-${slug}`
      : `${ALI_BASE}/taxon/${cdNom}`;

    cache.set(q.toLowerCase(), { url: finalUrl, ts: Date.now() });
    return finalUrl;
  } catch {
    return `${ALI_BASE}/?q=${encodeURIComponent(q)}`;
  }
}
