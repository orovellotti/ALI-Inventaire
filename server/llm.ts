import OpenAI from "openai";
import { z } from "zod";
import type { Occurrence } from "@shared/types";
import { fetchSpeciesStatuses, type SpeciesStatus, type Patrimonialite } from "./ali";
import { isInvasiveExotic } from "./invasive";
import { getNaturaZones, type Zonage } from "./services/geoservices";
import { getSpeciesForSite, type NaturaGrade } from "./services/natura2000Species";
import { getSiteHabitatInfo, type SiteHabitat, type SiteGeometry } from "./services/natura2000Habitats";
import {
  computeSiteMetrics,
  habitatCompatScore,
  type HabitatMetrics,
} from "./services/habitatCompat";
import { storage } from "./storage";
import { DEFAULT_HARNESS_CONFIG, migrateHarnessConfig } from "@shared/harness";
import { executeApprovedMcpTool, getMcpServerRegistry, type McpExecutionTrace } from "./mcp";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const MODEL = "gpt-5-mini";
const MAX_SAMPLED_SPECIES = 50;
const MAX_RETURNED_SPECIES = 5;
const MAX_FINAL_SPECIES = 10;
// Places réservées, dans le top final, aux espèces Natura 2000 « très probables
// localement » (classe C) ou « avérées à l'échelle du site » (classe B).
const NATURA_RESERVED_SLOTS = 4;
const NATURA_PROXIMITY_M = 5000;
const NATURA_FETCH_TIMEOUT_MS = 4000;
const NATURA_SPECIES_CONCURRENCY = 4;
const NATURA_SPECIES_BUDGET_MS = 12000;
const MAX_NATURA_SITES_IN_PROMPT = 12;
const MAX_SPECIES_PER_SITE_IN_PROMPT = 25;

const PRIORITY_IUCN = new Set(["CR", "EN", "VU", "NT", "DD"]);
const ALLOWED_LEVELS = ["majeur", "fort", "modéré"] as const;

const EVIDENCE_LABELS: Record<EvidenceClass, string> = {
  A: "Espèce observée",
  B: "Avérée à l'échelle du site",
  C: "Très probable localement",
  D: "Potentielle",
  E: "Peu pertinente localement",
};

// Phase 2 : le poids "habitat" (15 %) est réintroduit (compatibilité d'habitat
// emprise/site + distance écologique par groupe).
// statut 0,30 · importance site 0,25 · occurrence 0,20 · habitat 0,15 · qualité 0,10
const SCORE_WEIGHTS = {
  statut: 0.3,
  importanceSite: 0.25,
  occurrence: 0.2,
  habitat: 0.15,
  qualite: 0.1,
};

// Compatibilité d'habitat (0–100) au-delà de laquelle une espèce désignatrice
// non observée localement est jugée "très probable localement" (classe C)
// plutôt que seulement "avérée à l'échelle du site" (classe B).
const HABITAT_C_THRESHOLD = 50;

// Observation ≤ ce rayon depuis le centre de l'aire = "avéré localement" (A) ;
// au-delà (bord de l'aire d'étude) = "à proximité" → classe C pour une espèce du site.
const EVIDENCE_LOCAL_RADIUS_M = 2000;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

interface DesignatingInfo {
  name: string;
  designating: boolean;
  grade: NaturaGrade;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .slice(0, 2)
    .join(" ")
    .trim();
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

function gradeImportanceScore(grade: NaturaGrade, designating: boolean): number {
  if (!designating) return grade === "D" ? 25 : 0;
  switch (grade) {
    case "A": return 100;
    case "B": return 80;
    case "C": return 60;
    default: return 55;
  }
}

// Niveau d'enjeu (badge principal) aligné sur le score déterministe, afin qu'une
// espèce commune non menacée (ex : Gobemouche noir, LC) ne soit jamais affichée
// « fort » sur la seule appréciation subjective de l'IA.
function levelFromScore(score: number): (typeof ALLOWED_LEVELS)[number] {
  if (score >= 85) return "majeur";
  if (score >= 70) return "fort";
  return "modéré";
}

function scoreLabelFor(score: number): string {
  if (score >= 85) return "majeur";
  if (score >= 70) return "fort";
  if (score >= 50) return "modéré";
  if (score >= 30) return "à vérifier";
  return "faible";
}

interface ObsQuality {
  count: number;
  lastYear?: number;
  source?: "gbif" | "inaturalist";
}

// Qualité de la donnée d'occurrence (0–100), fondée sur des données réelles :
//  - abondance (nombre d'observations agrégées) ;
//  - récence (année d'observation la plus récente) ;
//  - source (GBIF agrégé légèrement priorisé sur iNaturalist citoyen).
// Espèce non observée localement (suggestion IA / site) : forfait bas.
function qualiteScoreFor(inInventory: boolean, obs?: ObsQuality): number {
  if (!inInventory) return 30;
  let score = 30; // socle « observée localement »

  const count = obs?.count ?? 1;
  score += (Math.min(count, 20) / 20) * 40; // jusqu'à +40 selon l'abondance

  const year = obs?.lastYear;
  if (year) {
    const yearsAgo = new Date().getFullYear() - year;
    const recency = Math.max(0, 1 - yearsAgo / 15); // 0 au-delà de 15 ans
    score += recency * 30; // jusqu'à +30 pour une donnée récente
  } else {
    score += 10; // date inconnue : contribution modeste
  }

  if (obs?.source === "inaturalist") score -= 5; // science participative

  return Math.max(0, Math.min(100, Math.round(score)));
}

function classifyAndScore(
  sp: PrioritySpecies,
  inventoryNorm: Set<string>,
  designatingMap: Map<string, DesignatingInfo>,
  obsNearestM: Map<string, number>,
  obsQuality: Map<string, ObsQuality>,
  habitatMap: Map<string, { metrics: HabitatMetrics | null; fallbackDistanceM: number }>,
): PrioritySpecies {
  const norm = normalizeName(sp.scientificName);
  const inInventory = inventoryNorm.has(norm) || sp.inInventory;
  const nearestM = obsNearestM.get(norm);
  const hasDistance = nearestM !== undefined;
  // Observation sans coordonnées connues : on la considère "dans l'aire" (elle
  // provient de l'inventaire) → cœur d'aire par défaut.
  const observedInCore = inInventory && (!hasDistance || nearestM! <= EVIDENCE_LOCAL_RADIUS_M);
  const observedAtProximity = inInventory && hasDistance && nearestM! > EVIDENCE_LOCAL_RADIUS_M;
  const site = designatingMap.get(norm);

  // Compatibilité d'habitat (0–100) : l'habitat désigné du site se recoupe-t-il
  // avec l'emprise pour ce groupe taxonomique ? (Phase 2)
  const habitat = habitatMap.get(norm);
  const habitatScore = habitat
    ? habitatCompatScore(sp.group, habitat.metrics, habitat.fallbackDistanceM)
    : 0;
  const habitatFavorable = habitatScore >= HABITAT_C_THRESHOLD;

  // Attribution du niveau de preuve A–E (booléens mutuellement exclusifs) :
  //  A  observation locale dans l'aire d'étude proche (≤ EVIDENCE_LOCAL_RADIUS_M, ou sans coord.)
  //  C  espèce du site très probable localement : observée à proximité (bord de
  //     l'aire) OU habitat désigné favorable dans l'emprise (Phase 2)
  //  B  espèce désignatrice Natura 2000 (grade significatif) sans habitat favorable → avérée au site
  //  E  espèce du site au grade FSD non significatif "D", non observée → peu pertinente
  //  D  espèce du site sans observation locale, ou suggestion écorégionale → potentielle
  let evidenceClass: EvidenceClass;
  if (observedInCore) {
    evidenceClass = "A";
  } else if (observedAtProximity) {
    evidenceClass = site ? "C" : "A";
  } else if (site?.designating) {
    evidenceClass = habitatFavorable ? "C" : "B";
  } else if (site && !site.designating) {
    evidenceClass = "E";
  } else {
    evidenceClass = "D";
  }

  // Espèce exotique envahissante (EEE) : aucune valeur patrimoniale de
  // conservation, même si son statut UICN mondial (évalué dans son aire
  // d'origine) est défavorable. On neutralise le volet « statut » et on la
  // signale explicitement plutôt que de la présenter comme un enjeu.
  const isInvasive = isInvasiveExotic(sp.scientificName);
  const hasReglementaire = (sp.statuses ?? []).some(
    (s) => s.tone === "danger" || s.tone === "warn",
  );
  const statutScore = isInvasive
    ? 0
    : sp.patrimonialite
      ? sp.patrimonialite.score
      : hasReglementaire
        ? 55
        : 40;
  const importanceSite = site ? gradeImportanceScore(site.grade, site.designating) : 0;
  const occurrenceScore = observedInCore ? 100 : observedAtProximity ? 70 : 0;
  const obs = obsQuality.get(norm);
  const qualiteScore = qualiteScoreFor(inInventory, obs);

  const rawScore = Math.round(
    SCORE_WEIGHTS.statut * statutScore +
      SCORE_WEIGHTS.importanceSite * importanceSite +
      SCORE_WEIGHTS.occurrence * occurrenceScore +
      SCORE_WEIGHTS.habitat * habitatScore +
      SCORE_WEIGHTS.qualite * qualiteScore,
  );
  // Une EEE ne peut pas figurer dans une bande d'enjeu élevé : on plafonne son
  // score de conservation dans la zone « faible » (elle relève de la gestion,
  // pas de la patrimonialité).
  const score = isInvasive ? Math.min(rawScore, 20) : rawScore;

  return {
    ...sp,
    // Une EEE n'est jamais un enjeu de conservation : niveau plafonné à
    // « modéré » et patrimonialité masquée (elle reflèterait l'aire d'origine).
    isInvasive,
    patrimonialite: isInvasive ? undefined : sp.patrimonialite,
    evidenceClass,
    evidenceLabel: EVIDENCE_LABELS[evidenceClass],
    level: isInvasive ? "modéré" : levelFromScore(score),
    score,
    scoreLabel: isInvasive ? "Exotique envahissante (EEE)" : scoreLabelFor(score),
    qualiteScore,
    observationCount: inInventory ? obs?.count : undefined,
    lastObservationYear: obs?.lastYear,
    source: obs?.source,
  };
}

// Ordre de pertinence locale : A (observé) puis C (habitat favorable dans
// l'emprise, très probable localement) avant B (avéré au site mais simple
// mention d'un grand site distant), puis D, E.
const EVIDENCE_ORDER: Record<EvidenceClass, number> = { A: 0, C: 1, B: 2, D: 3, E: 4 };

export type EvidenceClass = "A" | "B" | "C" | "D" | "E";

export interface PrioritySpecies {
  scientificName: string;
  vernacularName?: string;
  group: string;
  icon: string;
  reason: string;
  level: (typeof ALLOWED_LEVELS)[number];
  sources: string[];
  inInventory: boolean;
  aliUrl?: string;
  statuses?: SpeciesStatus[];
  patrimonialite?: Patrimonialite;
  evidenceClass: EvidenceClass;
  evidenceLabel: string;
  score: number;
  scoreLabel: string;
  qualiteScore?: number;
  observationCount?: number;
  lastObservationYear?: number;
  source?: "gbif" | "inaturalist";
  isInvasive?: boolean;
}

export interface NaturaZoneSpecies {
  name: string;
  designating: boolean;
  grade: NaturaGrade;
}

export interface Natura2000Zone {
  type: string;
  name: string;
  url: string | null;
  code: string | null;
  species: NaturaZoneSpecies[];
  // Phase 2 — compatibilité d'habitat emprise/site.
  overlapRatio: number | null;
  distanceM: number | null;
  habitats: SiteHabitat[];
}

export interface PrioritySpeciesAnalysis {
  toponym: string;
  species: PrioritySpecies[];
  natura2000: Natura2000Zone[];
  generatedAt: string;
  mcpTrace: McpExecutionTrace[];
}

const prioritySpeciesSchema = z.object({
  scientificName: z.string().min(1),
  vernacularName: z.string().optional(),
  group: z.string().optional().default("Autres"),
  icon: z.string().optional().default("🌿"),
  reason: z.string().optional().default(""),
  level: z.enum(ALLOWED_LEVELS).optional().default("modéré"),
  sources: z.array(z.string()).max(5).optional().default([]),
});

const priorityResponseSchema = z.object({
  species: z.array(prioritySpeciesSchema).optional().default([]),
});

const PRIORITY_SYSTEM_PROMPT = `Tu es un expert en écologie française et en pré-diagnostic écologique.
Tu connais les statuts UICN, espèces protégées en France, ZNIEFF déterminantes, directives Habitats/Oiseaux.
Les espèces exotiques envahissantes (EEE : Agave, Yucca, Opuntia, Carpobrotus, Reynoutria, Buddleja, Robinia, Ambrosia, Trachemys, Myocastor, Vespa velutina, etc.) ne sont JAMAIS des enjeux de conservation : leur statut UICN reflète leur aire d'origine, pas un enjeu local. Ne leur attribue pas de niveau « fort » ou « majeur » ; le cas échéant signale-les comme EEE (préoccupation de gestion, pas de patrimonialité).
Tu incarnes un écologue senior pédagogue et rigoureux. Ton ton est professionnel, rassurant, clair et synthétique. Tu distingues explicitement données documentées, hypothèses écologiques et conclusions. Tu expliques les sources, limites et besoins de terrain, sans jargon inutile, sans alarmisme et sans affirmation excessive. Chaque conclusion débouche sur une action proportionnée et justifiée.`;

const REFORMAT_SYSTEM_PROMPT = `Tu es un écologue senior spécialisé dans la rédaction des volets naturels d'étude d'impact en France.

Tu transformes exclusivement les données reçues d'ALi Inventaire et de son harnais en une pré-VNEI documentaire professionnelle. Le document est une trame à compléter, jamais une étude réglementaire définitive ni un document validé par un écologue.

RÈGLES SCIENTIFIQUES ABSOLUES
- N'invente aucune espèce, occurrence, source, URL, citation juridique, géométrie, pression de projet ou résultat absent des données reçues.
- Distingue toujours : donnée connue dans l'aire bibliographique, présence potentielle par compatibilité écologique, présence confirmée sur le terrain.
- Une occurrence dans un rayon d'étude ne prouve pas la présence dans l'emprise.
- Une absence de donnée ne signifie jamais absence d'espèce.
- Ne classe jamais un taxon en enjeu fort uniquement parce qu'il est UICN « Non évalué », « Données insuffisantes » ou sans statut.
- Une espèce exotique envahissante est un enjeu de gestion, pas automatiquement un enjeu patrimonial.
- Une ZNIEFF est un inventaire patrimonial, pas une protection réglementaire.
- Ne calcule aucun impact définitif sans description des travaux, pressions, calendrier et emprise exacte.
- N'aborde la compensation qu'après l'évitement et la réduction, et seulement si des impacts résiduels significatifs sont documentés.
- Toute donnée manquante doit être signalée explicitement au lieu d'être complétée par supposition.

HARNAIS D'ALi
Le harnais coordonne l'analyse, répartit le travail entre les agents Occurrences, Zonages et Potentiel écologique, consolide leurs réponses et applique les garde-fous scientifiques. Il mobilise uniquement les sources citées dans les données reçues. Décris cette orchestration dans la méthodologie et le registre des sources sans inventer de MCP ou d'agent absent.

HIÉRARCHIE DES SOURCES
Privilégie les textes réglementaires vérifiés, référentiels institutionnels français, DREAL/OFB/PatriNat/INPN, SINP, publications reconnues, bases internationales puis données contributives. Les inférences écologiques viennent toujours après les observations documentées.

VOCABULAIRE
Utilise : état initial, aires d'étude, enjeu local de conservation, espèce patrimoniale ou protégée seulement si le statut est fourni, habitat d'espèce, fonctionnalité écologique, sensibilité, impact potentiel, séquence éviter-réduire-compenser, niveau de confiance et suffisance des prospections.

STATUT DU DOCUMENT
Nom obligatoire : « Pré-VNEI documentaire à compléter par des investigations de terrain ».
Lorsque le projet est insuffisamment décrit, produis un état initial bibliographique enrichi et une analyse des sensibilités. Marque les chapitres impacts et ERC comme provisoires ou non évaluables.

Incarne un écologue senior pédagogue et rigoureux. Rédige avec le ton d’un bureau d’études expérimenté : professionnel et rassurant, clair et synthétique, factuel et prudent, orienté vers la décision et l’action. Explique les termes techniques utiles, les sources, les limites et les besoins d’expertise terrain. Ne sois jamais alarmiste ni excessivement affirmatif. Une expertise réglementaire fiable, expliquée simplement et tournée vers l’action.`;

async function configuredAgentInstructions(nativeId?: string): Promise<string> {
  try {
    const config = await storage.getHarnessConfig();
    const agents = (config?.agents ?? []).filter((agent) => agent.enabled && (!nativeId || agent.id === nativeId));
    if (!agents.length) return "";
    return `\n\nCONSIGNES CONFIGURÉES DU HARNAIS (subordonnées aux garde-fous ci-dessus) :\n${agents
      .map((agent) => `- ${agent.name} : ${agent.prompt}`)
      .join("\n")}`;
  } catch {
    return "";
  }
}

function selectRelevantSpecies(occurrences: Occurrence[]): Occurrence[] {
  const uniqueByName = new Map<string, Occurrence>();
  for (const o of occurrences) {
    if (!uniqueByName.has(o.scientificName)) uniqueByName.set(o.scientificName, o);
  }
  const unique = Array.from(uniqueByName.values());

  const high = unique.filter((s) => s.alertLevel === "high");
  const medium = unique.filter((s) => s.alertLevel === "medium");
  const lowPriority = unique.filter(
    (s) => s.alertLevel === "low" && s.iucnStatus && PRIORITY_IUCN.has(s.iucnStatus),
  );

  return [...high, ...medium, ...lowPriority].slice(0, MAX_SAMPLED_SPECIES);
}

// Correspondance classe taxonomique → groupe/icône, pour synthétiser une entrée
// lorsque l'IA n'a pas produit de narration pour cette espèce.
const CLASS_GROUP: Record<string, { group: string; icon: string }> = {
  Aves: { group: "Oiseaux", icon: "🦅" },
  Mammalia: { group: "Mammifères", icon: "🦔" },
  Reptilia: { group: "Reptiles", icon: "🦎" },
  Amphibia: { group: "Amphibiens", icon: "🐸" },
  Actinopterygii: { group: "Poissons", icon: "🐟" },
  Insecta: { group: "Insectes", icon: "🦋" },
  Arachnida: { group: "Arachnides", icon: "🕷️" },
  Mollusca: { group: "Mollusques", icon: "🐚" },
  Magnoliopsida: { group: "Plantes", icon: "🌿" },
  Liliopsida: { group: "Plantes", icon: "🌿" },
};

function groupForClass(cls?: string): { group: string; icon: string } {
  return (cls && CLASS_GROUP[cls]) || { group: "Autres", icon: "🌿" };
}

const EMPTY_EVIDENCE = {
  evidenceClass: "D" as EvidenceClass,
  evidenceLabel: EVIDENCE_LABELS.D,
  score: 0,
  scoreLabel: "",
};

// Entrée déterministe pour une espèce observée dans l'inventaire, non narrée par l'IA.
function baseFromOccurrence(o: Occurrence): PrioritySpecies {
  const g = groupForClass(o.class);
  const iucn = o.iucnStatus ? `, statut UICN ${o.iucnStatus}` : "";
  return {
    scientificName: o.scientificName,
    vernacularName: o.vernacularName,
    group: g.group,
    icon: g.icon,
    reason: `Espèce observée dans l'aire d'étude${iucn}.`,
    level: o.alertLevel === "high" ? "majeur" : o.alertLevel === "medium" ? "fort" : "modéré",
    sources: o.iucnStatus ? ["UICN"] : [],
    inInventory: true,
    ...EMPTY_EVIDENCE,
  };
}

// Entrée déterministe pour une espèce désignatrice d'un site Natura 2000 proche,
// non observée localement et non narrée par l'IA.
function baseFromNatura(name: string, grade: NaturaGrade): PrioritySpecies {
  return {
    scientificName: name,
    group: "Autres",
    icon: "🌿",
    reason: `Espèce désignatrice d'un site Natura 2000 à proximité${grade ? ` (grade ${grade})` : ""}.`,
    level: "fort",
    sources: ["Natura 2000 (FSD)"],
    inInventory: false,
    ...EMPTY_EVIDENCE,
  };
}

function formatSpeciesForPrompt(species: Occurrence[]): string {
  return species
    .map((s) => {
      const parts = [s.scientificName];
      if (s.vernacularName) parts.push(`(${s.vernacularName})`);
      if (s.iucnStatus) parts.push(`UICN:${s.iucnStatus}`);
      if (s.class) parts.push(`[${s.class}]`);
      return parts.join(" ");
    })
    .join("\n");
}

function buildPriorityPrompt(toponym: string, coords: [number, number], sample: string, totalCount: number, natura: Natura2000Zone[]): string {
  const naturaBlock = natura.length > 0
    ? `\nZones Natura 2000 à proximité (rayon ${NATURA_PROXIMITY_M / 1000} km) avec leurs espèces désignatrices (Formulaire Standard de Données) :\n${natura
        .slice(0, MAX_NATURA_SITES_IN_PROMPT)
        .map((z) => {
          const designating = z.species.filter((s) => s.designating);
          const shown = designating.slice(0, MAX_SPECIES_PER_SITE_IN_PROMPT).map((s) => s.name);
          const extra = designating.length > shown.length ? ` (+${designating.length - shown.length} autres)` : "";
          const sp = shown.length > 0 ? `\n  Espèces désignatrices : ${shown.join(", ")}${extra}` : "";
          return `- ${z.type} : ${z.name}${sp}`;
        })
        .join("\n")}\nCes espèces désignatrices justifient la désignation des sites : tu peux en retenir même si elles n'apparaissent pas dans l'inventaire GBIF ci-dessus (elles seront classées comme avérées à l'échelle du site).\n`
    : "";
  return `Site : ${toponym} (lat ${coords[0].toFixed(4)}, lng ${coords[1].toFixed(4)})
Inventaire GBIF (${totalCount} espèces) :
${sample}
${naturaBlock}
Identifie jusqu’à **5 taxons appelant une attention prioritaire** pour ce pré-diagnostic écologique. N’en ajoute aucun uniquement pour atteindre un nombre.
Choisis-les en priorité parmi les espèces ci-dessus, mais tu peux ajouter une espèce attendue sur le secteur (connaissance écorégionale) si elle est plus pertinente que la donnée GBIF disponible.

Réponds en JSON strict :
{
  "species": [
    {
      "scientificName": "...",
      "vernacularName": "...",
      "group": "Oiseaux|Mammifères|Reptiles|Amphibiens|Insectes|Plantes|...",
      "icon": "🦅",
      "reason": "1 phrase factuelle citant les référentiels (UICN France, Arrêté du 29 oct. 2009, Directive Oiseaux Annexe I, Directive Habitats Annexe II/IV, ZNIEFF déterminante…)",
      "level": "majeur|fort|modéré",
      "sources": ["UICN France 2016", "Arrêté du 29 oct. 2009", "Directive Oiseaux 2009/147/CE Annexe I"]
    }
  ]
}

Règles :
- De 0 à 5 espèces, triées par niveau d’attention décroissant.
- "sources" = liste courte (1 à 4) des référentiels cités dans "reason" (ex : "UICN France", "UICN Monde", "Arrêté du 29 oct. 2009", "Arrêté du 23 avr. 2007", "Directive Oiseaux Annexe I", "Directive Habitats Annexe II", "ZNIEFF déterminante", "Liste rouge régionale").
- N'invente jamais de source, n'utilise que les référentiels officiels français/européens.
- Si des zones Natura 2000 sont listées ci-dessus, tiens-en compte : privilégie les espèces qui justifient leur désignation (Directive Habitats Annexe II/IV, Directive Oiseaux Annexe I) et, le cas échéant, mentionne le site concerné dans "reason".`;
}

function buildReformatPrompt(rawReport: string): string {
  return `Construis la pré-VNEI documentaire à partir des seules données brutes ci-dessous.

Produis un document principal en Markdown avec ce plan proportionné :

# Pré-VNEI documentaire à compléter par des investigations de terrain
- Localisation, date, version et statut du document

## Diagnostic préalable de qualité et de complétude
- confiance du pré-diagnostic bibliographique ;
- complétude pour une VNEI réglementaire ;
- motif principal de l'incomplétude.

## Cinq informations manquantes prioritaires
Sépare ce qui bloque l'analyse des impacts de ce qui bloque la validation des enjeux.

## Résumé non technique
Présente le contexte, les principaux enjeux documentaires, les sensibilités, les mesures prioritaires et la conclusion provisoire.

## 1. Objet, contexte et statut du document
## 2. Présentation du projet et informations disponibles
## 3. Cadre réglementaire et procédures potentielles
Ne cite aucun article absent des données. Indique « impossible à déterminer avec les données disponibles » si nécessaire.
## 4. Méthodologie et harnais d'ALi
Décris la coordination, les agents mobilisés, les sources réellement utilisées, les filtres, la consolidation et les garde-fous.
## 5. Contexte écologique et aires d'étude
## 6. Zonages environnementaux
## 7. Données bibliographiques et consultations
Distingue observations documentaires, potentialités et confirmations terrain.
## 8. Habitats naturels et flore
## 9. Faune
## 10. Fonctionnalités écologiques
## 11. Synthèse et hiérarchisation des enjeux
## 12. Effets et impacts potentiels
Marque cette section provisoire ou non évaluable si les pressions du projet sont absentes.
## 13. Effets cumulés
## 14. Mesures d'évitement et de réduction
Ne propose que des orientations proportionnées et factuellement justifiées.
## 15. Impacts résiduels et compensation éventuelle
Ne conclus pas en l'absence d'impacts bruts évaluables.
## 16. Programme d'investigations complémentaires
Propose uniquement les groupes biologiques pertinents, avec périodes et objectifs.
## 17. Données manquantes, limites et contrôles à faire valider
## 18. Registre des sources et du harnais
Pour chaque source réellement citée : organisme, ressource, périmètre, utilisation et limites disponibles.
## 19. Conclusion et niveau de complétude
## Annexes disponibles

Contraintes de sortie :
- conserve les liens fournis ;
- cite les noms vernaculaires lorsqu'ils sont disponibles ;
- ne transforme jamais une occurrence bibliographique en présence certaine dans l'emprise ;
- toute affirmation structurante doit renvoyer à une source présente dans les données ;
- utilise « non documenté », « non évaluable » ou « à confirmer » plutôt que d'inventer ;
- ne produis pas de JSON dans cette réponse : l'interface attend ici le document Markdown lisible ;
- vise un document utile et structuré, sans remplissage artificiel.

Données brutes et registre du harnais :
─────────
${rawReport}
─────────`;
}

function normalizePriorityResponse(rawJson: string, inventoryNames: Set<string>): PrioritySpecies[] {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const result = priorityResponseSchema.safeParse(parsedJson);
  const rawSpecies: unknown[] = result.success
    ? result.data.species
    : Array.isArray((parsedJson as any)?.species)
      ? (parsedJson as any).species
      : [];

  const normalized: PrioritySpecies[] = [];
  for (const raw of rawSpecies) {
    const item = prioritySpeciesSchema.safeParse(raw);
    if (!item.success) continue;
    normalized.push({
      scientificName: item.data.scientificName,
      vernacularName: item.data.vernacularName,
      group: item.data.group,
      icon: item.data.icon,
      reason: item.data.reason,
      level: item.data.level,
      sources: item.data.sources,
      inInventory: inventoryNames.has(item.data.scientificName),
      evidenceClass: "D",
      evidenceLabel: EVIDENCE_LABELS.D,
      score: 0,
      scoreLabel: "",
    });
    if (normalized.length >= MAX_RETURNED_SPECIES) break;
  }
  return normalized;
}

async function fetchNaturaZones(
  coords: [number, number],
  empriseRadiusM: number,
): Promise<Natura2000Zone[]> {
  try {
    const zones = await Promise.race([
      getNaturaZones(coords[0], coords[1], NATURA_PROXIMITY_M),
      new Promise<Zonage[]>((resolve) => setTimeout(() => resolve([]), NATURA_FETCH_TIMEOUT_MS)),
    ]);
    const deadline = Date.now() + NATURA_SPECIES_BUDGET_MS;
    const result: Natura2000Zone[] = zones.map((z) => ({
      type: z.type,
      name: z.name,
      url: z.url,
      code: z.code,
      species: [] as NaturaZoneSpecies[],
      overlapRatio: null,
      distanceM: null,
      habitats: [] as SiteHabitat[],
    }));

    let index = 0;
    const worker = async (): Promise<void> => {
      while (index < zones.length) {
        const current = index++;
        const z = zones[current];
        if (!z.code || Date.now() >= deadline) continue;
        // Espèces désignatrices + habitats/polygone du site en parallèle.
        const [speciesRes, habitatRes] = await Promise.allSettled([
          getSpeciesForSite(z.code),
          getSiteHabitatInfo(z.code),
        ]);
        result[current].species =
          speciesRes.status === "fulfilled"
            ? speciesRes.value.map((s) => ({
                name: s.name,
                designating: s.designating,
                grade: s.grade,
              }))
            : [];
        let geometry: SiteGeometry | null = null;
        if (habitatRes.status === "fulfilled" && habitatRes.value) {
          const info = habitatRes.value;
          result[current].habitats = info.habitats;
          geometry = info.geometry;
        }
        // Repli sur la géométrie WFS (ex. ZPS : absentes de la couche EEA
        // Natura2000Sites, mais fournies par patrinat_zps du WFS IGN).
        if (!geometry && z.geometry) geometry = z.geometry;
        const metrics = computeSiteMetrics(
          coords[0],
          coords[1],
          empriseRadiusM,
          geometry,
        );
        if (metrics) {
          result[current].overlapRatio = metrics.overlapRatio;
          result[current].distanceM = metrics.distanceM;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(NATURA_SPECIES_CONCURRENCY, zones.length) }, () => worker()),
    );
    return result;
  } catch {
    return [];
  }
}

export async function analyzePrioritySpecies(
  toponym: string,
  coords: [number, number],
  occurrences: Occurrence[],
): Promise<PrioritySpeciesAnalysis> {
  const picked = selectRelevantSpecies(occurrences);
  const sample = formatSpeciesForPrompt(picked);
  const uniqueCount = new Set(occurrences.map((o) => o.scientificName)).size;
  const natura2000 = await fetchNaturaZones(coords, EVIDENCE_LOCAL_RADIUS_M);
  const harnessConfig = migrateHarnessConfig(await storage.getHarnessConfig()) ?? DEFAULT_HARNESS_CONFIG;
  const agents = harnessConfig.agents;
  const mcpTrace = await Promise.all(
    agents.flatMap((agent) =>
      (agent.mcpToolIds ?? []).map((toolId) =>
        executeApprovedMcpTool(
          agent,
          toolId,
          {
            lat: coords[0],
            lng: coords[1],
            radius: EVIDENCE_LOCAL_RADIUS_M,
            scientificName: picked[0]?.scientificName,
          },
          () => getMcpServerRegistry(harnessConfig.mcpServers),
        ),
      ),
    ),
  );
  const harnessInstructions = await configuredAgentInstructions("occurrences");
  const mcpContext = mcpTrace.some((trace) => trace.status === "success")
    ? `\n\nRÉSULTATS MCP APPROUVÉS (données d’appui, sans extrapolation) :\n${mcpTrace
        .filter((trace) => trace.status === "success")
        .map((trace) => `- ${trace.agentId}/${trace.toolId} : ${trace.summary}`)
        .join("\n")}`
    : "";

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: PRIORITY_SYSTEM_PROMPT + harnessInstructions + mcpContext },
      { role: "user", content: buildPriorityPrompt(toponym, coords, sample, uniqueCount, natura2000) },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Réponse LLM vide");

  const inventoryNames = new Set(occurrences.map((o) => o.scientificName));
  const llmSpecies = normalizePriorityResponse(content, inventoryNames);

  const inventoryNorm = new Set(occurrences.map((o) => normalizeName(o.scientificName)));
  const obsNearestM = new Map<string, number>();
  for (const o of occurrences) {
    if (typeof o.decimalLatitude !== "number" || typeof o.decimalLongitude !== "number") continue;
    const key = normalizeName(o.scientificName);
    const d = haversineM(coords[0], coords[1], o.decimalLatitude, o.decimalLongitude);
    const prev = obsNearestM.get(key);
    if (prev === undefined || d < prev) obsNearestM.set(key, d);
  }
  const obsQuality = new Map<string, ObsQuality>();
  for (const o of occurrences) {
    const key = normalizeName(o.scientificName);
    const count = typeof o.observationCount === "number" ? o.observationCount : 1;
    const lastYear = typeof o.lastObservationYear === "number" ? o.lastObservationYear : undefined;
    const existing = obsQuality.get(key);
    if (!existing) {
      obsQuality.set(key, { count, lastYear, source: o.source });
    } else {
      existing.count += count;
      if (lastYear && (!existing.lastYear || lastYear > existing.lastYear)) existing.lastYear = lastYear;
      // Priorise GBIF comme source si au moins une occurrence en provient.
      if (o.source === "gbif") existing.source = "gbif";
    }
  }
  const designatingMap = new Map<string, DesignatingInfo>();
  for (const zone of natura2000) {
    for (const s of zone.species) {
      const key = normalizeName(s.name);
      const existing = designatingMap.get(key);
      // Consolider sur le meilleur grade et retenir "désignatrice" si un seul site l'atteste.
      if (!existing || gradeRank(s.grade) > gradeRank(existing.grade)) {
        designatingMap.set(key, {
          name: existing?.name ?? s.name,
          designating: s.designating || (existing?.designating ?? false),
          grade: s.grade,
        });
      } else if (s.designating && !existing.designating) {
        existing.designating = true;
      }
    }
  }

  // Compatibilité d'habitat par espèce (Phase 2) : pour chaque espèce du site,
  // retenir la meilleure métrique géométrique parmi ses sites (polygone du site
  // vs emprise). Les sites sans polygone (ex. ZPS oiseaux) alimentent un repli
  // fondé sur la proximité connue (les sites sont fetchés à ≤ NATURA_PROXIMITY_M).
  const FALLBACK_SITE_DISTANCE_M = NATURA_PROXIMITY_M / 2;
  const habitatMap = new Map<
    string,
    { metrics: HabitatMetrics | null; fallbackDistanceM: number }
  >();
  for (const zone of natura2000) {
    const metrics: HabitatMetrics | null =
      zone.overlapRatio !== null && zone.distanceM !== null
        ? { overlapRatio: zone.overlapRatio, distanceM: zone.distanceM }
        : null;
    const zoneDistance = metrics ? metrics.distanceM : FALLBACK_SITE_DISTANCE_M;
    for (const s of zone.species) {
      const key = normalizeName(s.name);
      const existing = habitatMap.get(key);
      // Préférer un site avec polygone, puis la distance la plus faible.
      const existingDistance = existing
        ? existing.metrics
          ? existing.metrics.distanceM
          : existing.fallbackDistanceM
        : Infinity;
      const better =
        !existing ||
        (metrics && !existing.metrics) ||
        (!!metrics === !!existing.metrics && zoneDistance < existingDistance);
      if (better) {
        habitatMap.set(key, { metrics, fallbackDistanceM: FALLBACK_SITE_DISTANCE_M });
      }
    }
  }

  // Union déterministe des espèces à enjeux, indépendante des aléas de l'IA :
  //  1. narration IA (prioritaire, garde le texte explicatif) ;
  //  2. espèces observées à enjeux issues de l'inventaire (GBIF/iNaturalist) ;
  //  3. espèces désignatrices des sites Natura 2000 proches.
  // Dédoublonnage par nom normalisé ; la première source rencontrée l'emporte.
  const bySpecies = new Map<string, PrioritySpecies>();
  for (const sp of llmSpecies) bySpecies.set(normalizeName(sp.scientificName), sp);
  for (const o of selectRelevantSpecies(occurrences)) {
    const key = normalizeName(o.scientificName);
    if (!bySpecies.has(key)) bySpecies.set(key, baseFromOccurrence(o));
  }
  for (const [key, info] of Array.from(designatingMap.entries())) {
    if (info.designating && !bySpecies.has(key)) {
      bySpecies.set(key, baseFromNatura(info.name, info.grade));
    }
  }

  const byEvidenceThenScore = (a: PrioritySpecies, b: PrioritySpecies) => {
    const diff = EVIDENCE_ORDER[a.evidenceClass] - EVIDENCE_ORDER[b.evidenceClass];
    if (diff !== 0) return diff;
    return b.score - a.score;
  };

  // Classer d'abord sans les statuts ALI pour hiérarchiser, puis n'enrichir
  // (appels ALI coûteux, séquentiels) que les MAX_FINAL_SPECIES retenues.
  const rankedAll = Array.from(bySpecies.values())
    .map((sp) => classifyAndScore(sp, inventoryNorm, designatingMap, obsNearestM, obsQuality, habitatMap))
    .sort(byEvidenceThenScore);
  // Réserver quelques places aux espèces Natura 2000 « très probables localement »
  // (classe C) ou « avérées à l'échelle du site » (classe B). Sinon, dès que l'aire
  // compte déjà MAX_FINAL_SPECIES espèces observées (classe A), ces espèces sont
  // systématiquement évincées du top et l'apport des sites Natura 2000 reste invisible.
  const siteProbable = rankedAll.filter(
    (sp) => sp.evidenceClass === "C" || sp.evidenceClass === "B",
  );
  const reserved = siteProbable.slice(0, NATURA_RESERVED_SLOTS);
  const reservedKeys = new Set(reserved.map((sp) => normalizeName(sp.scientificName)));
  const filler = rankedAll
    .filter((sp) => !reservedKeys.has(normalizeName(sp.scientificName)))
    .slice(0, Math.max(0, MAX_FINAL_SPECIES - reserved.length));
  const ranked = [...filler, ...reserved].sort(byEvidenceThenScore);

  const enriched = await enrichWithAliStatuses(ranked);
  const classified = enriched
    .map((sp) => classifyAndScore(sp, inventoryNorm, designatingMap, obsNearestM, obsQuality, habitatMap))
    .sort(byEvidenceThenScore);

  return {
    toponym,
    species: classified,
    natura2000,
    generatedAt: new Date().toISOString(),
    mcpTrace,
  };
}

// ALI's AI-powered /taxons/search endpoint cannot handle concurrent requests:
// firing several at once makes them ALL time out. Enrich strictly one-at-a-time.
const ALI_CONCURRENCY = 1;
const ALI_ENRICH_BUDGET_MS = 40000;

async function enrichOne(sp: PrioritySpecies): Promise<PrioritySpecies> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const enrichment = await fetchSpeciesStatuses(sp.scientificName);
      if (!enrichment) return sp;
      return { ...sp, aliUrl: enrichment.aliUrl, statuses: enrichment.statuses, patrimonialite: enrichment.patrimonialite };
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
    }
  }
  return sp;
}

async function enrichAllBatches(species: PrioritySpecies[]): Promise<PrioritySpecies[]> {
  const result: PrioritySpecies[] = [];
  for (let i = 0; i < species.length; i += ALI_CONCURRENCY) {
    const batch = species.slice(i, i + ALI_CONCURRENCY);
    result.push(...(await Promise.all(batch.map(enrichOne))));
  }
  return result;
}

async function enrichWithAliStatuses(species: PrioritySpecies[]): Promise<PrioritySpecies[]> {
  return Promise.race([
    enrichAllBatches(species),
    new Promise<PrioritySpecies[]>((resolve) =>
      setTimeout(() => resolve(species), ALI_ENRICH_BUDGET_MS),
    ),
  ]);
}

export async function reformatReport(rawReport: string): Promise<string> {
  const harnessInstructions = await configuredAgentInstructions();
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: REFORMAT_SYSTEM_PROMPT + harnessInstructions },
      { role: "user", content: buildReformatPrompt(rawReport) },
    ],
  });
  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Réponse LLM vide");
  return content;
}
