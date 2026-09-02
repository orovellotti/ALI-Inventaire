/**
 * Résumé compact d'un statut ALI/TAXREF, stocké sur l'occurrence pour affichage
 * côté client sans appel API supplémentaire.
 */
export interface AliStatusSummary {
  /** Catégorie lisible : "Liste rouge nationale", "Protection nationale", etc. */
  category: string;
  /** Code court : "VU", "Protégée", "Annexe II", etc. */
  value: string;
  /** Libellé complet (peut être long). */
  label: string;
  /** Tonalité visuelle. */
  tone: "danger" | "warn" | "info" | "neutral";
  /** Territoire de l'évaluation : "PACA", "France métropolitaine", etc. */
  scope?: string;
}

/**
 * Niveau d'enjeu territorial (remplace alertLevel pour la classification en buckets).
 * Calculé à partir des statuts régionaux/nationaux/européens, jamais du seul UICN mondial.
 */
export type EnjeuLevel =
  | "critique"    // CR/EX au niveau national ou régional
  | "fort"        // EN/VU territorial ou NT + protection forte
  | "modere"      // NT sans protection forte, ou protection seule
  | "faible"      // LC ou aucun signal conservation
  | "a_confirmer"; // Groupe protégé mais statut national non vérifié

export interface Occurrence {
  key: number;
  scientificName: string;
  decimalLatitude: number;
  decimalLongitude: number;
  vernacularName?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  alertLevel: "high" | "medium" | "low";
  imageUrl?: string;
  iucnStatus?: string;
  taxonKey?: number;
  source?: "gbif" | "inaturalist";
  sourceUrl?: string;
  cdNom?: number;
  frenchProtected?: boolean;
  isInvasive?: boolean;
  observationCount?: number;
  lastObservationYear?: number;
  sourceNames?: string[];
  /** Rang taxonomique GBIF : SPECIES, SUBSPECIES, VARIETY, GENUS, FAMILY… */
  taxonRank?: string;
  /** Classification de l'habitat principal (heuristique taxonomique). */
  habitatType?: "terrestrial" | "marine";
  /** Statuts ALI/TAXREF enrichis (liste rouge régionale/nationale, protection…). */
  aliStatuses?: AliStatusSummary[];
  /** Niveau d'enjeu calculé à partir des statuts territoriaux. */
  enjeuLevel?: EnjeuLevel;
  /** Avertissements de cohérence (LC classé fort, protégée classée faible, etc.). */
  enjeuWarnings?: string[];
}

export interface ConfidenceScore {
  total: number;
  geo: number;
  tax: number;
  time: number;
  trace: number;
  issues: number;
  dup: number;
  interpretation: "excellent" | "good" | "moderate" | "low";
  message: string;
  rawCount: number;
  filteredCount: number;
  dedupCount: number;
}

export interface BufferCircle {
  id: string;
  center: [number, number];
  radius: number;
  label: string;
  enabled: boolean;
}

export interface StudyArea {
  id: string;
  label: string;
  radius: number;
  color: string;
  dashArray?: string;
}

export interface ProjectPreset {
  id: string;
  label: string;
  icon: string;
  description: string;
  zones: {
    immediate: { radius: number; enabled: boolean };
    rapprochee: { radius: number; enabled: boolean };
    eloignee: { radius: number; enabled: boolean };
  };
}

export interface InventoryResult {
  occurrences: Occurrence[];
  stats: {
    total: number;
    speciesCount: number;
    sensitiveCount: number;
    rawNameCount?: number;
    duplicatesRemoved?: number;
  };
  center: [number, number];
  radius: number;
  circles: BufferCircle[];
  confidence: ConfidenceScore;
  /** Traçabilité de la phase d'enrichissement territorial ALI Species. */
  aliSpeciesEnrichment?: {
    source: "ALI Species MCP";
    region?: string;
    territorialScope: "single" | "multiple" | "unknown";
    attempted: number;
    enriched: number;
    failed: number;
    skipped: number;
    partial: boolean;
  };
}

export interface InventoryRequest {
  circles: BufferCircle[];
}

/** Statut d'un indice déterministe de compatibilité écologique (jamais une probabilité de présence). */
export type PotentialSpeciesStatus =
  | "Très probable localement"
  | "Potentielle"
  | "Peu compatible"
  | "Non évaluée";

export type PotentialSpeciesConfidence = "Élevé" | "Moyen" | "Faible";

export interface PotentialSpeciesItem {
  scientificName: string;
  speciesGroup: string;
  /** Vrai uniquement si une occurrence réelle de l'inventaire porte ce nom scientifique. */
  observed: boolean;
  status: PotentialSpeciesStatus;
  /** Indice de compatibilité écologique ; null quand les données sont insuffisantes. */
  score: number | null;
  confidence: PotentialSpeciesConfidence;
  reasons: string[];
  sites: { code: string; name: string }[];
  habitats: { code: string; description: string }[];
}

export type ZnieffDeterminationStatus = "D" | "E" | "A";

export interface ZnieffDocumentedSpeciesItem {
  scientificName: string;
  citedName: string;
  speciesGroup: string;
  cdRef: string | null;
  determinationStatus: ZnieffDeterminationStatus;
  /**
   * Signal transversal uniquement : la preuve d'observation reste l'occurrence
   * géolocalisée et n'est jamais déduite de la ZNIEFF.
   */
  alsoObserved: boolean;
  zones: {
    code: string;
    name: string;
    type: string;
    url: string | null;
    determinationStatus: ZnieffDeterminationStatus;
  }[];
}

export interface ZnieffDocumentaryResult {
  species: ZnieffDocumentedSpeciesItem[];
  speciesCount: number;
  siteCount: number;
  partial: boolean;
  reference: {
    id: string;
    title: string;
    publisher: string;
    sourceUrl: string;
    sourceUpdated: string;
    sourceVersion: string;
  };
}

export interface PotentialSpeciesResult {
  species: PotentialSpeciesItem[];
  observedCount: number;
  potentialCount: number;
  evaluatedCount: number;
  siteCount: number;
  habitatCount: number;
  partial: boolean;
  reference: {
    id: string;
    title: string;
    publisher: string;
    sourceUrl: string;
    sourceUpdated: string;
  };
  znieff: ZnieffDocumentaryResult;
  generatedAt: string;
}

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
}

export interface SINPPlatform {
  region: string;
  code: string;
  links: { label: string; url: string }[];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export interface TaxonGroupDef {
  id: string;
  label: string;
  icon: string;
}
