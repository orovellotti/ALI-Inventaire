const SPECIES_LAYER =
  "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Species/MapServer/0/query";
const TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SPECIES_PER_SITE = 80;

export type NaturaGrade = "A" | "B" | "C" | "D" | null;

export interface NaturaSpecies {
  name: string;
  sensitive: boolean;
  motivation: string | null;
  grade: NaturaGrade;
  designating: boolean;
}

const cache = new Map<string, { at: number; data: NaturaSpecies[] }>();

function isValidSiteCode(code: string): boolean {
  return /^[A-Z]{2}\d{6,}$/i.test(code);
}

const ANNEX_TOKENS = new Set(["I", "II", "III", "IV", "V", "VI"]);

function parseMotivation(motivation: string | null): { grade: NaturaGrade; hasAnnex: boolean } {
  if (!motivation) return { grade: null, hasAnnex: false };
  const tokens = motivation.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  const grade = (tokens.find((t) => /^[A-D]$/.test(t)) as NaturaGrade) ?? null;
  const hasAnnex = tokens.some((t) => ANNEX_TOKENS.has(t));
  return { grade, hasAnnex };
}

// Grade "D" = population non significative (espèce simplement présente).
// Grade A/B/C = espèce désignatrice significative.
// Grade absent : désignatrice seulement si une annexe est explicitement citée
// (sinon on ne présume pas de significativité).
function computeDesignating(grade: NaturaGrade, hasAnnex: boolean): boolean {
  if (grade === "D") return false;
  if (grade) return true;
  return hasAnnex;
}

function gradeRank(grade: NaturaGrade): number {
  switch (grade) {
    case "A": return 4;
    case "B": return 3;
    case "C": return 2;
    case null: return 1.5;
    case "D": return 1;
    default: return 0;
  }
}

export async function getSpeciesForSite(siteCode: string): Promise<NaturaSpecies[]> {
  const code = siteCode.trim().toUpperCase();
  if (!isValidSiteCode(code)) return [];

  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const params = new URLSearchParams({
    where: `SITECODE='${code}'`,
    outFields: "CONTAINSSPECIES_SPECIESNAME,SpeciesNameClean,CONTAINSSPECIES_SENSITIVE,CONTAINSSPECIES_MOTIVATION",
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

    const byName = new Map<string, NaturaSpecies>();
    for (const f of features) {
      const a = f?.attributes ?? {};
      const name = String(a.SpeciesNameClean || a.CONTAINSSPECIES_SPECIESNAME || "").trim();
      if (!name) continue;
      const motivation = a.CONTAINSSPECIES_MOTIVATION != null ? String(a.CONTAINSSPECIES_MOTIVATION).trim() : null;
      const { grade, hasAnnex } = parseMotivation(motivation);
      const sensitive = String(a.CONTAINSSPECIES_SENSITIVE || "").trim() === "1";
      const key = name.toLowerCase();
      const existing = byName.get(key);
      if (!existing || gradeRank(grade) > gradeRank(existing.grade)) {
        byName.set(key, { name, sensitive, motivation, grade, designating: computeDesignating(grade, hasAnnex) });
      }
    }
    const species = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (species.length > 0) cache.set(code, { at: Date.now(), data: species });
    return species;
  } finally {
    clearTimeout(timer);
  }
}
