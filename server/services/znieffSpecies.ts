import type {
  ZnieffDeterminationStatus,
  ZnieffDocumentaryResult,
  ZnieffDocumentedSpeciesItem,
} from "@shared/types";
import type { ZnieffReferenceMeta } from "@shared/schema";
import type { Zonage } from "./geoservices";
import { normalizeSpeciesName } from "./potentialSpeciesScore";

export const ZNIEFF_REFERENCE_ID = "patrinat-znieff";
export const ZNIEFF_SOURCE_URL =
  "https://www.patrinat.fr/fr/page-temporaire-de-telechargement-des-referentiels-de-donnees-lies-linpn-7353";

export interface ZnieffSpeciesRow {
  zoneCode: string;
  cdRef: string;
  scientificName: string;
  citedName: string;
  speciesGroup: string;
  determinationStatus: string;
}

const DETERMINATION_RANK: Record<ZnieffDeterminationStatus, number> = {
  D: 3,
  E: 2,
  A: 1,
};

function isPublicDeterminationStatus(
  value: string,
): value is ZnieffDeterminationStatus {
  return value === "D" || value === "E" || value === "A";
}

/**
 * Retire une autorité taxonomique usuelle tout en conservant les épithètes
 * infra-spécifiques. Cette clé complète le nom exact pour rapprocher, par
 * exemple, « Lutra lutra (Linnaeus, 1758) » et « Lutra lutra ».
 */
export function canonicalTaxonName(value: string): string {
  return normalizeSpeciesName(value);
}

export function buildZnieffReference(
  meta: ZnieffReferenceMeta | undefined,
): ZnieffDocumentaryResult["reference"] {
  return {
    id: ZNIEFF_REFERENCE_ID,
    title: "Reference database of terrestrial and marine ZNIEFF sites",
    publisher: "PatriNat / INPN",
    sourceUrl: meta?.sourceUrl || ZNIEFF_SOURCE_URL,
    sourceUpdated: meta?.sourceUpdated || "inconnue",
    sourceVersion: meta?.sourceVersion || "",
  };
}

/**
 * Regroupe les mentions ZNIEFF sans les injecter dans le score Natura 2000.
 * Le cdRef TAXREF est la clé préférée ; le nom normalisé sert uniquement de
 * repli lorsque la ligne source ne contient pas de cdRef.
 */
export function buildZnieffDocumentedSpecies(
  rows: ZnieffSpeciesRow[],
  zones: Zonage[],
  observedNames: Set<string>,
): ZnieffDocumentedSpeciesItem[] {
  const zoneByCode = new Map(
    zones
      .filter((zone) => zone.code)
      .map((zone) => [zone.code!.trim(), zone] as const),
  );
  const species = new Map<string, ZnieffDocumentedSpeciesItem>();

  for (const row of rows) {
    const zoneCode = row.zoneCode.trim();
    const zone = zoneByCode.get(zoneCode);
    if (!zone || !isPublicDeterminationStatus(row.determinationStatus)) {
      continue;
    }
    const normalizedName = normalizeSpeciesName(row.scientificName);
    if (!normalizedName) continue;
    const cdRef = row.cdRef.trim();
    const key = cdRef ? `taxref:${cdRef}` : `name:${normalizedName}`;
    let item = species.get(key);
    if (!item) {
      item = {
        scientificName: row.scientificName.trim(),
        citedName: row.citedName.trim(),
        speciesGroup: row.speciesGroup.trim(),
        cdRef: cdRef || null,
        determinationStatus: row.determinationStatus,
        alsoObserved:
          observedNames.has(normalizedName) ||
          observedNames.has(canonicalTaxonName(row.scientificName)),
        zones: [],
      };
      species.set(key, item);
    }

    if (
      DETERMINATION_RANK[row.determinationStatus] >
      DETERMINATION_RANK[item.determinationStatus]
    ) {
      item.determinationStatus = row.determinationStatus;
    }
    if (!item.speciesGroup && row.speciesGroup) {
      item.speciesGroup = row.speciesGroup.trim();
    }
    if (!item.citedName && row.citedName) {
      item.citedName = row.citedName.trim();
    }
    if (!item.zones.some((entry) => entry.code === zoneCode)) {
      item.zones.push({
        code: zoneCode,
        name: zone.name,
        type: zone.type,
        url: zone.url,
        determinationStatus: row.determinationStatus,
      });
    }
  }

  return Array.from(species.values()).sort(
    (a, b) =>
      DETERMINATION_RANK[b.determinationStatus] -
        DETERMINATION_RANK[a.determinationStatus] ||
      a.scientificName.localeCompare(b.scientificName, "fr"),
  );
}