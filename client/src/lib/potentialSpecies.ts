import type {
  Occurrence,
  PotentialSpeciesResult,
} from "@shared/types";

function normalizeSpeciesName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function canonicalTaxonName(value: string): string {
  const withoutAuthority = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+\([^)]*\).*$/, "")
    .replace(/,\s*\d{4}.*$/, "");
  const tokens = withoutAuthority.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return normalizeSpeciesName(value);
  const kept = tokens.slice(0, 2);
  const third = tokens[2];
  if (third && /^[a-zà-öø-ÿ-]+$/.test(third)) {
    kept.push(third);
  } else if (third && /^(subsp\.?|ssp\.?|var\.?|f\.?)$/i.test(third)) {
    kept.push(third);
    const fourth = tokens[3];
    if (fourth && /^[a-zà-öø-ÿ-]+$/.test(fourth)) kept.push(fourth);
  }
  return normalizeSpeciesName(kept.join(" "));
}

function isOccurrenceInStudyArea(
  occurrence: Occurrence,
  center: [number, number],
  radius: number,
): boolean {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(occurrence.decimalLatitude - center[0]);
  const dLng = toRadians(occurrence.decimalLongitude - center[1]);
  const lat1 = toRadians(center[0]);
  const lat2 = toRadians(occurrence.decimalLatitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const distance = 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distance <= radius;
}

/** Lance le calcul écologique sans attendre l'inventaire GBIF/iNaturalist. */
export async function fetchPotentialSpecies(
  lat: number,
  lng: number,
  radius: number,
  signal?: AbortSignal,
): Promise<PotentialSpeciesResult> {
  const response = await fetch("/api/potential-species", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ lat, lng, radius, occurrences: [] }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Assessment unavailable");
  }
  return response.json();
}

/**
 * Rattache les occurrences reçues plus tard au calcul déjà terminé.
 * Les scores de compatibilité restent inchangés : seul le statut avéré/potentiel
 * et le signal documentaire ZNIEFF sont mis à jour.
 */
export function reconcilePotentialSpecies(
  result: PotentialSpeciesResult | null,
  occurrences: Occurrence[],
  center: [number, number],
  radius: number,
): PotentialSpeciesResult | null {
  if (!result) return null;

  const observedNames = new Set(
    occurrences
      .filter((occurrence) =>
        (occurrence.source === "gbif" || occurrence.source === "inaturalist") &&
        isOccurrenceInStudyArea(occurrence, center, radius),
      )
      .flatMap((occurrence) => [
        normalizeSpeciesName(occurrence.scientificName),
        canonicalTaxonName(occurrence.scientificName),
      ]),
  );

  const reconciledSpecies = result.species
    .map((item) => ({
      ...item,
      observed:
        observedNames.has(normalizeSpeciesName(item.scientificName)) ||
        observedNames.has(canonicalTaxonName(item.scientificName)),
    }));

  // Une même espèce peut remonter plusieurs fois depuis des sites Natura 2000.
  // La consolider ici garantit une identité React stable et évite de compter
  // plusieurs fois le même taxon sans perdre ses éléments de preuve.
  const speciesByTaxon = new Map<string, (typeof reconciledSpecies)[number]>();
  for (const item of reconciledSpecies) {
    const key = canonicalTaxonName(item.scientificName);
    const existing = speciesByTaxon.get(key);
    if (!existing) {
      speciesByTaxon.set(key, item);
      continue;
    }

    const sites = new Map(existing.sites.map((site) => [`${site.code}::${site.name}`, site]));
    item.sites.forEach((site) => sites.set(`${site.code}::${site.name}`, site));
    const habitats = new Map(existing.habitats.map((habitat) => [`${habitat.code}::${habitat.description}`, habitat]));
    item.habitats.forEach((habitat) => habitats.set(`${habitat.code}::${habitat.description}`, habitat));

    speciesByTaxon.set(key, {
      ...existing,
      observed: existing.observed || item.observed,
      score: Math.max(existing.score ?? -1, item.score ?? -1) < 0
        ? null
        : Math.max(existing.score ?? -1, item.score ?? -1),
      reasons: Array.from(new Set([...existing.reasons, ...item.reasons])),
      sites: Array.from(sites.values()),
      habitats: Array.from(habitats.values()),
    });
  }

  const species = Array.from(speciesByTaxon.values())
    .sort(
      (a, b) =>
        Number(a.observed) - Number(b.observed) ||
        (b.score ?? -1) - (a.score ?? -1) ||
        a.scientificName.localeCompare(b.scientificName, "en"),
    );

  return {
    ...result,
    species,
    observedCount: species.filter((item) => item.observed).length,
    potentialCount: species.filter((item) => !item.observed).length,
    znieff: result.znieff
      ? {
          ...result.znieff,
          species: result.znieff.species.map((item) => ({
            ...item,
            alsoObserved:
              observedNames.has(normalizeSpeciesName(item.scientificName)) ||
              observedNames.has(canonicalTaxonName(item.scientificName)),
          })),
        }
      : result.znieff,
  };
}