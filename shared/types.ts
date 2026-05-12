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
  };
  center: [number, number];
  radius: number;
  circles: BufferCircle[];
  confidence: ConfidenceScore;
}

export interface InventoryRequest {
  circles: BufferCircle[];
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
