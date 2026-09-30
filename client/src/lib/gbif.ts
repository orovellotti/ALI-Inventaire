import type {
  Occurrence as OccurrenceType,
  ConfidenceScore as ConfidenceScoreType,
  BufferCircle as BufferCircleType,
  InventoryResult as InventoryResultType,
  ProjectPreset as ProjectPresetType,
  StudyArea,
  EnjeuLevel,
} from "@shared/types";

export type Occurrence = OccurrenceType;
export type ConfidenceScore = ConfidenceScoreType;
export type BufferCircle = BufferCircleType;
export type InventoryResult = InventoryResultType;
export type ProjectPreset = ProjectPresetType;
export type { EnjeuLevel };

export interface TaxonGroup {
  id: string;
  label: string;
  icon: string;
  match: (occ: Occurrence) => boolean;
}

export const TAXON_GROUPS: TaxonGroup[] = [
  { id: "oiseaux", label: "Birds", icon: "🐦", match: (o) => o.class === "Aves" },
  { id: "mammiferes", label: "Mammals", icon: "🦊", match: (o) => o.class === "Mammalia" },
  { id: "reptiles", label: "Reptiles", icon: "🦎", match: (o) => o.class === "Reptilia" },
  { id: "amphibiens", label: "Amphibians", icon: "🐸", match: (o) => o.class === "Amphibia" },
  { id: "poissons", label: "Fish", icon: "🐟", match: (o) => ["Actinopterygii", "Chondrichthyes", "Petromyzonti", "Cephalaspidomorphi"].includes(o.class || "") },
  { id: "insectes", label: "Insects", icon: "🦋", match: (o) => o.class === "Insecta" },
  { id: "arachnides", label: "Arachnids", icon: "🕷️", match: (o) => o.class === "Arachnida" },
  { id: "crustaces", label: "Crustaceans", icon: "🦀", match: (o) => ["Malacostraca", "Branchiopoda", "Ostracoda", "Maxillopoda", "Thecostraca", "Remipedia", "Cephalocarida"].includes(o.class || "") },
  { id: "myriapodes", label: "Myriapods", icon: "〰️", match: (o) => ["Chilopoda", "Diplopoda", "Pauropoda", "Symphyla"].includes(o.class || "") },
  { id: "mollusques", label: "Molluscs", icon: "🐌", match: (o) => o.phylum === "Mollusca" },
  { id: "annelides", label: "Annelids", icon: "〰️", match: (o) => o.phylum === "Annelida" },
  { id: "cnidaires", label: "Cnidarians", icon: "◉", match: (o) => o.phylum === "Cnidaria" },
  { id: "echinodermes", label: "Echinoderms", icon: "★", match: (o) => o.phylum === "Echinodermata" },
  { id: "eponges", label: "Sponges", icon: "◌", match: (o) => o.phylum === "Porifera" },
  { id: "autres-invertebres", label: "Other invertebrates", icon: "◇", match: (o) => o.kingdom === "Animalia" },
  { id: "algues", label: "Algae", icon: "≋", match: (o) => ["Rhodophyta", "Ochrophyta", "Chlorophyta", "Haptophyta", "Cryptophyta"].includes(o.phylum || "") || ["Phaeophyceae", "Florideophyceae", "Ulvophyceae"].includes(o.class || "") },
  { id: "plantes", label: "Terrestrial plants", icon: "🌿", match: (o) => o.kingdom === "Plantae" },
  { id: "champignons", label: "Fungi", icon: "🍄", match: (o) => o.kingdom === "Fungi" },
  { id: "autres", label: "Other organisms", icon: "🔬", match: () => true },
];

export function getTaxonGroupId(occ: Occurrence): string {
  for (const group of TAXON_GROUPS) {
    if (group.id === "autres") continue;
    if (group.match(occ)) return group.id;
  }
  return "autres";
}

const MARINE_PHYLA = new Set([
  "Cnidaria",
  "Echinodermata",
  "Porifera",
  "Ctenophora",
  "Brachiopoda",
  "Chaetognatha",
  "Bryozoa",
  "Hemichordata",
  "Phoronida",
  "Xenacoelomorpha",
  "Placozoa",
]);

const MARINE_CLASSES = new Set([
  "Chondrichthyes",
  "Cephalopoda",
  "Polyplacophora",
  "Scaphopoda",
  "Ascidiacea",
  "Thaliacea",
  "Appendicularia",
  "Anthozoa",
  "Hydrozoa",
  "Scyphozoa",
  "Cubozoa",
  "Asteroidea",
  "Echinoidea",
  "Holothuroidea",
  "Crinoidea",
  "Ophiuroidea",
]);

export function isMarineSpecies(occ: Occurrence): boolean {
  if (occ.phylum && MARINE_PHYLA.has(occ.phylum)) return true;
  if (occ.class && MARINE_CLASSES.has(occ.class)) return true;
  return false;
}

export const STUDY_AREAS = [
  { id: "immediate", label: "Immediate study area", radius: 500, color: "#0d9488", dashArray: undefined as string | undefined },
  { id: "rapprochee", label: "Nearby study area", radius: 2000, color: "#2563eb", dashArray: "10, 8" },
  { id: "eloignee", label: "Wider study area", radius: 6000, color: "#6366f1", dashArray: "5, 10" },
] as const;

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: "custom", label: "Custom", icon: "⚙️",
    description: "Configure study areas manually",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: false }, eloignee: { radius: 6000, enabled: false } },
  },
  {
    id: "eolien", label: "Wind farm", icon: "💨",
    description: "Onshore wind farm",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 5000, enabled: true }, eloignee: { radius: 15000, enabled: true } },
  },
  {
    id: "pv_petit", label: "Small ground-mounted solar", icon: "☀️",
    description: "Ground-mounted solar < 3 ha",
    zones: { immediate: { radius: 200, enabled: true }, rapprochee: { radius: 1000, enabled: true }, eloignee: { radius: 3000, enabled: true } },
  },
  {
    id: "pv_moyen", label: "Medium ground-mounted solar", icon: "☀️",
    description: "Ground-mounted solar 3–50 ha",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 6000, enabled: true } },
  },
  {
    id: "pv_grand", label: "Large ground-mounted solar", icon: "☀️",
    description: "Ground-mounted solar > 50 ha",
    zones: { immediate: { radius: 1000, enabled: true }, rapprochee: { radius: 3000, enabled: true }, eloignee: { radius: 10000, enabled: true } },
  },
  {
    id: "urbanisation", label: "Urban development", icon: "🏗️",
    description: "Urban development, residential estates, development zones",
    zones: { immediate: { radius: 300, enabled: true }, rapprochee: { radius: 1000, enabled: true }, eloignee: { radius: 3000, enabled: true } },
  },
  {
    id: "route", label: "Linear infrastructure", icon: "🛣️",
    description: "Road, railway, pipeline",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 5000, enabled: true } },
  },
  {
    id: "carriere", label: "Quarry / classified facility", icon: "⛏️",
    description: "Quarry or regulated industrial facility",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 6000, enabled: true } },
  },
];

// Territoire/source de l'évaluation UICN telle que fournie par GBIF : il s'agit
// de la Liste rouge mondiale. À expliciter systématiquement (une espèce « NT »
// mondiale n'a pas le même sens qu'une « NT » régionale).
export const IUCN_SOURCE_LABEL = "IUCN Global Red List";

export function getIucnLabel(code: string | undefined): string {
  const labels: Record<string, string> = {
    "EX": "Extinct", "EXTINCT": "Extinct",
    "EW": "Extinct in the Wild", "EXTINCT_IN_THE_WILD": "Extinct in the Wild",
    "RE": "Regionally Extinct", "REGIONALLY_EXTINCT": "Regionally Extinct",
    "CR": "Critically Endangered", "CRITICALLY_ENDANGERED": "Critically Endangered",
    "EN": "Endangered", "ENDANGERED": "Endangered",
    "VU": "Vulnerable", "VULNERABLE": "Vulnerable",
    "NT": "Near Threatened", "NEAR_THREATENED": "Near Threatened",
    "LC": "Least Concern", "LEAST_CONCERN": "Least Concern",
    "DD": "Data Deficient", "DATA_DEFICIENT": "Data Deficient",
    "NA": "Not Applicable", "NOT_APPLICABLE": "Not Applicable",
    "NE": "Not Evaluated", "NOT_EVALUATED": "Not Evaluated"
  };
  return labels[code || ""] || "Not Evaluated";
}

// Renvoie le statut avec son territoire/source, toujours. Distingue « statut non
// renseigné » (aucune donnée GBIF) de « non évalué » (évalué comme NE par l'UICN).
export function getIucnFullLabel(code: string | undefined): string {
  const c = (code || "").toUpperCase();
  if (!c) return "IUCN status not provided (GBIF source)";
  if (c === "NE" || c === "NOT_EVALUATED") return `Not Evaluated — ${IUCN_SOURCE_LABEL}`;
  if (c === "DD" || c === "DATA_DEFICIENT") return `Data Deficient — ${IUCN_SOURCE_LABEL}`;
  if (c === "NA" || c === "NOT_APPLICABLE") return `Not Applicable — ${IUCN_SOURCE_LABEL}`;
  return `${getIucnLabel(code)} — ${IUCN_SOURCE_LABEL}`;
}

export interface PatrimonialiteScore {
  level: number;
  label: string;
  color: string;
}

export function getPatrimonialite(
  iucnStatus: string | undefined,
  alertLevel: "high" | "medium" | "low",
  isInvasive?: boolean,
): PatrimonialiteScore {
  if (isInvasive) {
    return {
      level: 0,
      label: "Invasive alien species",
      color: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
    };
  }
  const s = iucnStatus?.toUpperCase();
  let level: number;
  switch (s) {
    case "EX": case "EXTINCT":
    case "EW": case "EXTINCT_IN_THE_WILD":
    case "RE": case "REGIONALLY_EXTINCT":
    case "CR": case "CRITICALLY_ENDANGERED":
      level = 5; break;
    case "EN": case "ENDANGERED":
      level = 4; break;
    case "VU": case "VULNERABLE":
      level = 3; break;
    case "NT": case "NEAR_THREATENED":
      level = 2; break;
    default:
      level = 1;
  }
  if (alertLevel === "medium" && level < 2) level = 2;

  const meta: Record<number, { label: string; color: string }> = {
    5: { label: "Major", color: "bg-red-100 text-red-700 border-red-200" },
    4: { label: "High", color: "bg-orange-100 text-orange-700 border-orange-200" },
    3: { label: "Moderate", color: "bg-amber-100 text-amber-700 border-amber-200" },
    2: { label: "Low", color: "bg-sky-100 text-sky-700 border-sky-200" },
    1: { label: "Very low", color: "bg-gray-100 text-gray-500 border-gray-200" },
  };
  return { level, ...meta[level] };
}

export async function searchGBIFMultiCircle(
  circles: BufferCircle[],
  options: { includeINaturalist?: boolean } = {}
): Promise<InventoryResult> {
  const response = await fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ circles, includeINaturalist: options.includeINaturalist !== false }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Server error" }));
    throw new Error(err.error || `Error ${response.status}`);
  }

  return response.json();
}
