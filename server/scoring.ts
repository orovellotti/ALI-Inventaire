/**
 * Moteur de scoring explicable — Enjeux espèces
 *
 * Classe chaque espèce en niveau d'enjeu (critique / fort / modéré / faible /
 * à_confirmer) à partir des statuts territoriaux dans l'ordre de priorité :
 *   Liste rouge régionale > nationale > européenne > mondiale
 *   + protection nationale/régionale + directives + ZNIEFF
 *
 * Le statut UICN mondial seul n'est JAMAIS suffisant pour classer une espèce
 * LC en enjeu fort. NE / NA / DD ne constituent pas un enjeu.
 */

import type { EnjeuLevel, AliStatusSummary } from "@shared/types";

// Sévérité ordinale des codes UICN (plus haut = plus menacé)
const THREAT_RANK: Record<string, number> = {
  EX: 9, EW: 8, RE: 7, CR: 6, EN: 5, VU: 4, NT: 3, LC: 1,
  DD: 0, NA: 0, NApp: 0, NE: 0,
};

function rankCode(code: string | undefined): number {
  return THREAT_RANK[(code ?? "").toUpperCase()] ?? 0;
}

/** Catégories traitées comme menace réelle (≥ NT). */
function isThreat(code: string | undefined): boolean {
  return rankCode(code) >= 3;
}

/**
 * Calcule le niveau d'enjeu et les avertissements de cohérence à partir des
 * statuts ALI (quand disponibles) ou des heuristiques GBIF en repli.
 */
export function computeEnjeuLevel(params: {
  globalIucn: string | undefined;
  frenchProtected: boolean;
  isInvasive: boolean;
  isPlant: boolean;
  aliStatuses: AliStatusSummary[] | undefined;
}): { enjeuLevel: EnjeuLevel; enjeuWarnings: string[] } {
  const { globalIucn, frenchProtected, isInvasive, isPlant, aliStatuses } = params;
  const warnings: string[] = [];

  // EEE : enjeu de gestion géré séparément, pas de conservation
  if (isInvasive) {
    return { enjeuLevel: "faible", enjeuWarnings: [] };
  }

  const hasAli = aliStatuses && aliStatuses.length > 0;

  if (hasAli) {
    // --- Extraire le meilleur code menace par territoire ---
    const redLists = aliStatuses.filter((s) =>
      s.category.startsWith("Liste rouge"),
    );
    const regional = redLists.filter((s) => s.category.includes("régionale"));
    const national = redLists.filter((s) => s.category.includes("nationale"));
    const european = redLists.filter((s) => s.category.includes("européenne"));
    const globalAli = redLists.filter((s) => s.category.includes("mondiale"));

    const bestRegional = Math.max(0, ...regional.map((s) => rankCode(s.value)));
    const bestNational = Math.max(0, ...national.map((s) => rankCode(s.value)));
    const bestEuropean = Math.max(0, ...european.map((s) => rankCode(s.value)));
    const bestGlobalAli = Math.max(0, ...globalAli.map((s) => rankCode(s.value)));

    // Priorité stricte : régionale > nationale > européenne.
    // On ne combine pas les scopes : si une évaluation régionale informationnelle
    // existe (au moins LC — rankCode > 0), elle supplante l'évaluation nationale.
    // Les évaluations DD à l'échelon régional (rankCode = 0) ne sont PAS traitées
    // comme une évaluation ferme : on descend alors à l'échelon national.
    // NE/NA/NApp sont déjà filtrés par normalizeStatuses et n'apparaissent jamais.
    const bestTerritorial =
      bestRegional > 0
        ? bestRegional              // Régionale ≥ LC → utiliser seule (ex. LC régional bat EN national)
        : bestNational > 0
          ? bestNational            // Pas d'évaluation régionale ferme → nationale
          : bestEuropean;           // Fallback européen

    // --- Statuts de protection ---
    const hasNationalProtection = aliStatuses.some(
      (s) => s.category === "Protection nationale",
    );
    const hasDirective = aliStatuses.some((s) =>
      s.category.startsWith("Directive"),
    );
    const hasZnieff = aliStatuses.some(
      (s) => s.category === "ZNIEFF déterminante",
    );
    const hasPna = aliStatuses.some(
      (s) => s.category === "Plan national d'action",
    );
    const hasAnyProtection =
      hasNationalProtection ||
      hasDirective ||
      hasZnieff ||
      hasPna ||
      aliStatuses.some((s) => s.category.startsWith("Protection"));

    // --- Calcul du niveau ---

    // Critique : CR ou EX au niveau régional ou national
    if (bestTerritorial >= 6) {
      return { enjeuLevel: "critique", enjeuWarnings: warnings };
    }

    // Fort : EN territorial, ou VU territorial avec protection
    if (bestTerritorial >= 5) {
      return { enjeuLevel: "fort", enjeuWarnings: warnings };
    }
    if (bestTerritorial === 4) {
      // VU
      return { enjeuLevel: "fort", enjeuWarnings: warnings };
    }

    // NT territorial
    if (bestTerritorial === 3) {
      if (hasNationalProtection || hasDirective || hasZnieff) {
        return { enjeuLevel: "fort", enjeuWarnings: warnings };
      }
      return { enjeuLevel: "modere", enjeuWarnings: warnings };
    }

    // LC territorial (rankCode = 1) — espèce évaluée et non menacée localement
    if (bestTerritorial === 1) {
      // Contrôle : LC national mais statut mondial menacé ?
      const globalRank = rankCode(globalIucn);
      if (globalRank >= 4) {
        warnings.push(
          `National/regional LC but global ${(globalIucn ?? "").toUpperCase()} — verify local status`,
        );
      }
      // Protégée mais LC : faible enjeu conservation, à noter
      if (hasNationalProtection || hasDirective) {
        return { enjeuLevel: "modere", enjeuWarnings: warnings };
      }
      return { enjeuLevel: "faible", enjeuWarnings: warnings };
    }

    // NE/NA/DD territorial (ou pas de liste rouge renvoyée)
    // → statuts réglementaires font foi
    if (hasNationalProtection) {
      return { enjeuLevel: "modere", enjeuWarnings: warnings };
    }
    if (hasDirective) {
      return { enjeuLevel: "modere", enjeuWarnings: warnings };
    }
    if (hasZnieff || hasPna) {
      return { enjeuLevel: "modere", enjeuWarnings: warnings };
    }
    if (hasAnyProtection) {
      return { enjeuLevel: "faible", enjeuWarnings: warnings };
    }

    if (isPlant && (rankCode(globalIucn) > 0 || bestGlobalAli > 0)) {
      return {
        enjeuLevel: "a_confirmer",
        enjeuWarnings: [
          "Plants: no regional, national or European status available; global IUCN status alone is insufficient",
        ],
      };
    }

    // Aucun statut de conservation pertinent
    const globalRank = rankCode(globalIucn);
    if (globalRank >= 4) {
      warnings.push(
        `No national/regional status found, but global ${(globalIucn ?? "").toUpperCase()} — verify status in France`,
      );
      return { enjeuLevel: "modere", enjeuWarnings: warnings };
    }
    return { enjeuLevel: "faible", enjeuWarnings: warnings };
  }

  // --- Repli sans données ALI ---
  const globalRank = rankCode(globalIucn);

  if (isPlant) {
    return {
      enjeuLevel: frenchProtected || globalRank > 0 ? "a_confirmer" : "faible",
      enjeuWarnings: [
        "Plants: regional, national and European statuses unverified; global IUCN status alone is insufficient",
      ],
    };
  }

  // Contrôle : LC classé fort sans justification territoriale
  if (globalRank === 1 && frenchProtected) {
    // LC mondial mais groupe protégé — statut national à vérifier
    return {
      enjeuLevel: "a_confirmer",
      enjeuWarnings: [
        "Group protected in France; national status unverified — confirm through field survey",
      ],
    };
  }

  if (globalRank >= 6) {
    // CR/EX mondial sans données nationales
    warnings.push(
      "Global IUCN status only — confirm national/regional status",
    );
    return { enjeuLevel: "critique", enjeuWarnings: warnings };
  }
  if (globalRank >= 5) {
    // EN mondial
    warnings.push(
      "Global IUCN status only — confirm national/regional status",
    );
    return { enjeuLevel: "fort", enjeuWarnings: warnings };
  }
  if (globalRank >= 4) {
    // VU mondial
    warnings.push(
      "Global IUCN status only — confirm national/regional status",
    );
    return { enjeuLevel: "fort", enjeuWarnings: warnings };
  }
  if (globalRank === 3) {
    // NT mondial
    const level = frenchProtected ? "fort" : "modere";
    warnings.push(
      "Global IUCN status only — confirm national/regional status",
    );
    return { enjeuLevel: level, enjeuWarnings: warnings };
  }
  if (frenchProtected) {
    // LC ou NE mondial mais groupe protégé en France → à confirmer
    return {
      enjeuLevel: "a_confirmer",
      enjeuWarnings: [
        "Group protected in France; national status unverified — confirm through field survey",
      ],
    };
  }

  return { enjeuLevel: "faible", enjeuWarnings: warnings };
}

/**
 * Contrôles de cohérence post-classification.
 * À appeler après avoir déterminé le niveau final.
 */
export function checkConsistency(params: {
  enjeuLevel: EnjeuLevel;
  globalIucn: string | undefined;
  aliStatuses: AliStatusSummary[] | undefined;
  frenchProtected: boolean;
}): string[] {
  const { enjeuLevel, globalIucn, aliStatuses, frenchProtected } = params;
  const warnings: string[] = [];

  // Espèce LC mondialement classée fort sans statut territorial
  if (
    (enjeuLevel === "critique" || enjeuLevel === "fort") &&
    rankCode(globalIucn) <= 1 &&
    (!aliStatuses || aliStatuses.filter((s) => isThreat(s.value)).length === 0)
  ) {
    warnings.push(
      "Global LC classified as high concern without a threatened national/regional status — verify",
    );
  }

  // Espèce protégée classée faible
  if (enjeuLevel === "faible" && frenchProtected) {
    warnings.push(
      "Group protected in France classified as low concern — verify legal status",
    );
  }

  // Statut sans territoire (quand des statuts ALI existent mais sans scope)
  if (aliStatuses) {
    const redListsWithoutScope = aliStatuses.filter(
      (s) =>
        s.category.startsWith("Liste rouge") &&
        !s.scope,
    );
    if (redListsWithoutScope.length > 0) {
      warnings.push(
        "Some red-list statuses have no specified geographic scope",
      );
    }
  }

  return warnings;
}
