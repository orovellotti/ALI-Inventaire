const SPECIES_LAYER =
  "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Species/MapServer/0/query";
const TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SPECIES_PER_SITE = 60;

export interface NaturaSpecies {
  name: string;
  sensitive: boolean;
}

const cache = new Map<string, { at: number; data: NaturaSpecies[] }>();

function isValidSiteCode(code: string): boolean {
  return /^[A-Z]{2}\d{6,}$/i.test(code);
}

export async function getSpeciesForSite(siteCode: string): Promise<NaturaSpecies[]> {
  const code = siteCode.trim().toUpperCase();
  if (!isValidSiteCode(code)) return [];

  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const params = new URLSearchParams({
    where: `SITECODE='${code}'`,
    outFields: "CONTAINSSPECIES_SPECIESNAME,SpeciesNameClean,CONTAINSSPECIES_SENSITIVE",
    returnGeometry: "false",
    resultRecordCount: String(MAX_SPECIES_PER_SITE),
    f: "json",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${SPECIES_LAYER}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];

    const seen = new Set<string>();
    const species: NaturaSpecies[] = [];
    for (const f of features) {
      const a = f?.attributes ?? {};
      const name = String(a.SpeciesNameClean || a.CONTAINSSPECIES_SPECIESNAME || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const sensitive = String(a.CONTAINSSPECIES_SENSITIVE || "").trim() === "1";
      species.push({ name, sensitive });
    }
    species.sort((a, b) => a.name.localeCompare(b.name));

    if (species.length > 0) cache.set(code, { at: Date.now(), data: species });
    return species;
  } finally {
    clearTimeout(timer);
  }
}
