import type {
  PotentialSpeciesConfidence,
  PotentialSpeciesItem,
  PotentialSpeciesStatus,
} from "@shared/types";
import type { HabitatMetrics } from "./habitatCompat";
import type { SiteHabitat } from "./natura2000Habitats";
import {
  EEA_HABITAT_ECOLOGICAL_GROUPS,
  EEA_SPECIES_ECOLOGICAL_GROUPS,
  type EeaSpeciesEcologicalGroup,
} from "../data/eeaEcologicalGroups";
import { normalizeTaxonIdentity } from "@shared/taxonomy";

export interface PotentialSpeciesSiteEvidence {
  code: string;
  name: string;
  habitats: SiteHabitat[];
  metrics: HabitatMetrics | null;
}

export interface PotentialSpeciesCandidate {
  scientificName: string;
  speciesGroup: string;
  observed: boolean;
  sites: PotentialSpeciesSiteEvidence[];
}

export function normalizeSpeciesName(value: string): string {
  return normalizeTaxonIdentity(value);
}

const PREFERENCE_SCORE: Record<string, number> = {
  E: 100,
  P: 85,
  "1": 75,
  S: 65,
  O: 35,
};

const PREFERENCE_LABEL: Record<string, string> = {
  E: "exclusive",
  P: "preferred",
  "1": "associated",
  S: "compatible",
  O: "occasional",
};

function statusFromScore(score: number): PotentialSpeciesStatus {
  if (score >= 75) return "Très probable localement";
  if (score >= 45) return "Potentielle";
  return "Peu compatible";
}

interface ScoredSite {
  site: PotentialSpeciesSiteEvidence;
  ecologicalScore: number;
  matches: {
    speciesGroup: EeaSpeciesEcologicalGroup;
    habitat: SiteHabitat;
    ecologicalLabel: string;
  }[];
}

function notEvaluated(
  candidate: PotentialSpeciesCandidate,
  reasons: string[],
): PotentialSpeciesItem {
  return {
    scientificName: candidate.scientificName,
    speciesGroup: candidate.speciesGroup,
    observed: candidate.observed,
    status: "Non évaluée",
    score: null,
    confidence: "Faible",
    reasons,
    sites: candidate.sites.map(({ code, name }) => ({ code, name })),
    habitats: [],
  };
}

/**
 * Évalue un candidat uniquement lorsque le référentiel EEA DAT-143 établit une
 * correspondance explicite entre ses groupes écologiques et ceux des habitats.
 * Les observations ne modifient jamais le score : elles servent seulement à
 * séparer strictement « observée » et « potentielle ».
 */
export function evaluatePotentialSpecies(
  candidate: PotentialSpeciesCandidate,
): PotentialSpeciesItem {
  const reasons: string[] = [];
  const sitesWithHabitats = candidate.sites.filter((site) => site.habitats.length > 0);
  const usableSites = sitesWithHabitats.filter((site) => site.metrics !== null);
  const hasIncompleteSite = candidate.sites.some(
    (site) => site.habitats.length === 0 || site.metrics === null,
  );
  const profile =
    EEA_SPECIES_ECOLOGICAL_GROUPS[normalizeSpeciesName(candidate.scientificName)];
  const mappedHabitatCount = usableSites.reduce(
    (count, site) =>
      count +
      site.habitats.filter(
        (habitat) =>
          (EEA_HABITAT_ECOLOGICAL_GROUPS[habitat.code]?.length ?? 0) > 0,
      ).length,
    0,
  );

  if (candidate.observed) {
    reasons.push("Documented occurrence within the study area; not confirmed on the project footprint.");
  }
  if (candidate.sites.length > 0) {
    reasons.push(
      `Species listed for ${candidate.sites.length} relevant Natura 2000 site${candidate.sites.length > 1 ? "s" : ""}.`,
    );
  }

  if (
    !profile ||
    profile.availability === "not sufficient" ||
    usableSites.length === 0 ||
    mappedHabitatCount === 0 ||
    hasIncompleteSite
  ) {
    if (!profile) {
      reasons.push("This species is not represented in the EEA DAT-143 ecological reference.");
    } else if (profile.availability === "not sufficient") {
      reasons.push("The reference identifies insufficient ecological knowledge for this species.");
    }
    if (sitesWithHabitats.length === 0) {
      reasons.push("No usable habitat description is available for the associated sites.");
    } else if (usableSites.length === 0) {
      reasons.push("Available geometry does not allow comparison with the project footprint.");
    } else if (mappedHabitatCount === 0) {
      reasons.push("Identified habitats are not represented in the EEA DAT-143 ecological reference.");
    }
    if (hasIncompleteSite) {
      reasons.push(
        "At least one associated site lacks usable habitats or geometry; no partial score is produced.",
      );
    }
    return notEvaluated(candidate, reasons);
  }

  const scoredSites: ScoredSite[] = usableSites.map((site) => {
    const matches: ScoredSite["matches"] = [];
    for (const habitat of site.habitats) {
      const habitatGroups = EEA_HABITAT_ECOLOGICAL_GROUPS[habitat.code] ?? [];
      for (const speciesGroup of profile.groups) {
        const habitatGroup = habitatGroups.find(
          (group) => group.code === speciesGroup.code,
        );
        if (habitatGroup) {
          matches.push({
            speciesGroup,
            habitat,
            ecologicalLabel: habitatGroup.label,
          });
        }
      }
    }
    const ecologicalScore = matches.reduce((best, match) => {
      const preference = PREFERENCE_SCORE[match.speciesGroup.preference] ?? 0;
      // Les habitats sont décrits à l'échelle du site Natura 2000, pas par un
      // polygone propre dans l'emprise. Le score est donc volontairement
      // plafonné à 70, même pour une association exclusive.
      const specificity =
        match.speciesGroup.level === "Level 1 group" ? 0.7 : 0.8;
      return Math.max(
        best,
        Math.min(70, Math.round(preference * specificity)),
      );
    }, 0);
    return { site, ecologicalScore, matches };
  });
  scoredSites.sort((a, b) => b.ecologicalScore - a.ecologicalScore);
  const best = scoredSites[0];
  if (best.matches.length === 0) {
    reasons.push(
      "No shared ecological group links this species to the mapped habitats in the EEA reference.",
    );
    return notEvaluated(candidate, reasons);
  }
  const score = best.ecologicalScore;
  const matchedHabitats = new Map<string, { code: string; description: string }>();
  for (const scoredSite of scoredSites) {
    for (const match of scoredSite.matches) {
      if (!matchedHabitats.has(match.habitat.code)) {
        matchedHabitats.set(match.habitat.code, {
          code: match.habitat.code,
          description: match.habitat.description,
        });
      }
    }
  }
  const habitatList = Array.from(matchedHabitats.values());
  const hasSpecificMatch = best.matches.some(
    (match) => match.speciesGroup.level !== "Level 1 group",
  );
  const confidence: PotentialSpeciesConfidence =
    candidate.observed && hasSpecificMatch ? "Élevé" : "Moyen";

  const bestMatch = [...best.matches].sort(
    (a, b) =>
      (PREFERENCE_SCORE[b.speciesGroup.preference] ?? 0) -
      (PREFERENCE_SCORE[a.speciesGroup.preference] ?? 0),
  )[0];
  reasons.push(
    `EEA ${PREFERENCE_LABEL[bestMatch.speciesGroup.preference] ?? "documented"} match with ecological group “${bestMatch.ecologicalLabel}”.`,
  );
  reasons.push(
    "Association is documented at Natura 2000 site scale; precise habitat location within the project footprint is unknown.",
  );
  const namedHabitats = habitatList
    .slice(0, 2)
    .map((habitat) => habitat.description || `habitat ${habitat.code}`);
  if (namedHabitats.length > 0) {
    reasons.push(`Compatible habitats: ${namedHabitats.join("; ")}.`);
  }

  return {
    scientificName: candidate.scientificName,
    speciesGroup: candidate.speciesGroup,
    observed: candidate.observed,
    status: statusFromScore(score),
    score,
    confidence,
    reasons: reasons.slice(0, 5),
    sites: candidate.sites.map(({ code, name }) => ({ code, name })),
    habitats: habitatList,
  };
}