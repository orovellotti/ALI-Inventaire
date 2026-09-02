const ALI_BASE = "https://alispecies.io";
const TIMEOUT_MS = 20000;

export interface AliTaxonHit {
  cdNom: number;
  cdRef: number;
  name: string;
  rang?: string;
}

export interface RawAliStatus {
  cdTypeStatut?: string;
  lbTypeStatut?: string;
  regroupementType?: string;
  codeStatut?: string;
  labelStatut?: string;
  rqStatut?: string | null;
  cdSig?: string;
  lbAdmTr?: string;
  niveauAdmin?: string;
  docUrl?: string | null;
}

interface RawSearchHit {
  cdNom?: number;
  cdRef?: number;
  lbNom?: string;
  nomValide?: string;
  nomVern?: string;
  rang?: string;
}

const searchCache = new Map<string, { hit: AliTaxonHit | null; ts: number }>();
const statusCache = new Map<number, { statuses: RawAliStatus[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24;

async function fetchJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`ALI ${r.status}`);
  return r.json();
}

export async function searchAliTaxon(query: string, timeoutMs = TIMEOUT_MS): Promise<AliTaxonHit | null> {
  const q = query.trim();
  if (!q) return null;

  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.hit;

  // Network/parse errors propagate (and are NOT cached) so a transient failure
  // does not poison the cache with a null result for CACHE_TTL.
  const data = await fetchJson(`${ALI_BASE}/api/taxons/search?q=${encodeURIComponent(q)}&limit=5`, timeoutMs);
  const hits: RawSearchHit[] = Array.isArray(data) ? data : [];
  const best = hits.find((h) => h.rang === "ES") ?? hits[0];
  const cdRef = best?.cdRef ?? best?.cdNom;
  const cdNom = best?.cdNom ?? best?.cdRef;

  const hit: AliTaxonHit | null =
    best && cdRef && cdNom
      ? { cdNom, cdRef, name: best.nomValide || best.lbNom || q, rang: best.rang }
      : null;

  searchCache.set(key, { hit, ts: Date.now() });
  return hit;
}

export async function fetchAliStatuts(cdNom: number): Promise<RawAliStatus[]> {
  const cached = statusCache.get(cdNom);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.statuses;

  // Errors propagate (not cached) — see searchAliTaxon.
  const data = await fetchJson(`${ALI_BASE}/api/taxons/${cdNom}/statuts`);
  const statuses: RawAliStatus[] = Array.isArray(data) ? (data as RawAliStatus[]) : [];

  statusCache.set(cdNom, { statuses, ts: Date.now() });
  return statuses;
}

export { ALI_BASE };
