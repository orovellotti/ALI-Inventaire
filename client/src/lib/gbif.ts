import type {
  Occurrence as OccurrenceType,
  ConfidenceScore as ConfidenceScoreType,
  BufferCircle as BufferCircleType,
  InventoryResult as InventoryResultType,
  ProjectPreset as ProjectPresetType,
  StudyArea,
} from "@shared/types";

export type Occurrence = OccurrenceType;
export type ConfidenceScore = ConfidenceScoreType;
export type BufferCircle = BufferCircleType;
export type InventoryResult = InventoryResultType;
export type ProjectPreset = ProjectPresetType;

export interface TaxonGroup {
  id: string;
  label: string;
  icon: string;
  match: (occ: Occurrence) => boolean;
}

export const TAXON_GROUPS: TaxonGroup[] = [
  { id: "oiseaux", label: "Oiseaux", icon: "🐦", match: (o) => o.class === "Aves" },
  { id: "mammiferes", label: "Mammifères", icon: "🦊", match: (o) => o.class === "Mammalia" },
  { id: "reptiles", label: "Reptiles", icon: "🦎", match: (o) => o.class === "Reptilia" },
  { id: "amphibiens", label: "Amphibiens", icon: "🐸", match: (o) => o.class === "Amphibia" },
  { id: "poissons", label: "Poissons", icon: "🐟", match: (o) => ["Actinopterygii", "Chondrichthyes", "Petromyzonti", "Cephalaspidomorphi"].includes(o.class || "") },
  { id: "insectes", label: "Insectes", icon: "🦋", match: (o) => o.class === "Insecta" },
  { id: "arachnides", label: "Arachnides", icon: "🕷️", match: (o) => o.class === "Arachnida" },
  { id: "mollusques", label: "Mollusques", icon: "🐌", match: (o) => o.phylum === "Mollusca" },
  { id: "plantes", label: "Plantes", icon: "🌿", match: (o) => o.kingdom === "Plantae" },
  { id: "champignons", label: "Champignons", icon: "🍄", match: (o) => o.kingdom === "Fungi" },
  { id: "autres", label: "Autres", icon: "🔬", match: () => true },
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
  { id: "immediate", label: "Aire d'étude immédiate", radius: 500, color: "#0d9488", dashArray: undefined as string | undefined },
  { id: "rapprochee", label: "Aire d'étude rapprochée", radius: 2000, color: "#2563eb", dashArray: "10, 8" },
  { id: "eloignee", label: "Aire d'étude éloignée", radius: 6000, color: "#6366f1", dashArray: "5, 10" },
] as const;

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: "custom", label: "Personnalisé", icon: "⚙️",
    description: "Configuration manuelle des aires d'étude",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: false }, eloignee: { radius: 6000, enabled: false } },
  },
  {
    id: "eolien", label: "Éolien", icon: "💨",
    description: "Parc éolien terrestre",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 5000, enabled: true }, eloignee: { radius: 15000, enabled: true } },
  },
  {
    id: "pv_petit", label: "PV sol petit", icon: "☀️",
    description: "Photovoltaïque au sol < 3 ha",
    zones: { immediate: { radius: 200, enabled: true }, rapprochee: { radius: 1000, enabled: true }, eloignee: { radius: 3000, enabled: true } },
  },
  {
    id: "pv_moyen", label: "PV sol moyen", icon: "☀️",
    description: "Photovoltaïque au sol 3-50 ha",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 6000, enabled: true } },
  },
  {
    id: "pv_grand", label: "PV sol grand", icon: "☀️",
    description: "Photovoltaïque au sol > 50 ha",
    zones: { immediate: { radius: 1000, enabled: true }, rapprochee: { radius: 3000, enabled: true }, eloignee: { radius: 10000, enabled: true } },
  },
  {
    id: "urbanisation", label: "Urbanisation", icon: "🏗️",
    description: "Aménagement urbain, lotissement, ZAC",
    zones: { immediate: { radius: 300, enabled: true }, rapprochee: { radius: 1000, enabled: true }, eloignee: { radius: 3000, enabled: true } },
  },
  {
    id: "route", label: "Infrastructure linéaire", icon: "🛣️",
    description: "Route, voie ferrée, canalisation",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 5000, enabled: true } },
  },
  {
    id: "carriere", label: "Carrière / ICPE", icon: "⛏️",
    description: "Carrière, installation classée",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 6000, enabled: true } },
  },
];

export function getIucnLabel(code: string | undefined): string {
  const labels: Record<string, string> = {
    "EX": "Éteint", "EXTINCT": "Éteint",
    "EW": "Éteint à l'état sauvage", "EXTINCT_IN_THE_WILD": "Éteint à l'état sauvage",
    "RE": "Éteint régionalement", "REGIONALLY_EXTINCT": "Éteint régionalement",
    "CR": "En danger critique", "CRITICALLY_ENDANGERED": "En danger critique",
    "EN": "En danger", "ENDANGERED": "En danger",
    "VU": "Vulnérable", "VULNERABLE": "Vulnérable",
    "NT": "Quasi menacé", "NEAR_THREATENED": "Quasi menacé",
    "LC": "Préoccupation mineure", "LEAST_CONCERN": "Préoccupation mineure",
    "DD": "Données insuffisantes", "DATA_DEFICIENT": "Données insuffisantes",
    "NA": "Non applicable", "NOT_APPLICABLE": "Non applicable",
    "NE": "Non évalué", "NOT_EVALUATED": "Non évalué"
  };
  return labels[code || ""] || "Non évalué";
}

export interface PatrimonialiteScore {
  level: number;
  label: string;
  color: string;
}

export function getPatrimonialite(
  iucnStatus: string | undefined,
  alertLevel: "high" | "medium" | "low",
): PatrimonialiteScore {
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
    5: { label: "Majeure", color: "bg-red-100 text-red-700 border-red-200" },
    4: { label: "Forte", color: "bg-orange-100 text-orange-700 border-orange-200" },
    3: { label: "Modérée", color: "bg-amber-100 text-amber-700 border-amber-200" },
    2: { label: "Faible", color: "bg-sky-100 text-sky-700 border-sky-200" },
    1: { label: "Très faible", color: "bg-gray-100 text-gray-500 border-gray-200" },
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
    const err = await response.json().catch(() => ({ error: "Erreur serveur" }));
    throw new Error(err.error || `Erreur ${response.status}`);
  }

  return response.json();
}
