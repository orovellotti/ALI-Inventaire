---
name: Taxonomic consolidation by cdRef
description: How inventory occurrences are deduplicated into valid taxa, and why the two-key bridge exists
---

# Consolidation des taxons (déduplication)

`consolidateByCdRef` (server/gbif.ts) collapses inventory occurrences into valid
taxa after GBIF+iNat merge, on every result path (single, multi-circle, iNat-only
empty). It powers `stats.rawNameCount` (noms bruts) vs `stats.speciesCount`
(taxons valides) and `stats.duplicatesRemoved`, plus `Occurrence.sourceNames[]`.

**Rule:** the consolidation key is the TAXREF cdRef (`fetchTaxRefCdNom`, which
returns `referenceId` = accepted taxon) when present, else a normalized name
(`normalizeName` strips the author: parentheses, patronym, year). A
`nameToKey` bridge map lets a `cd:` entry and a `nm:` entry collapse when they
share a normalized name — needed because TAXREF may resolve one source and
time out on the other, so the same taxon can arrive with and without a cdNom.

**Why:** GBIF/iNat return the same species both with and without author
(`Aloe arborescens` vs `Aloe arborescens Mill.`), inflating the count (~540 raw
→ ~389 valid on a Marseille test). Users (ecologists) read the inflated number
as "445 espèces" and distrust the tool. The spec (pré-diagnostic refactor)
requires "X noms collectés → Y taxons valides".

**How to apply:** if you touch consolidation, keep the two-key bridge and always
seed/union `sourceNames` (`occ.sourceNames ?? [occ.scientificName]`) so provenance
survives the multi-circle double pass. Never dedup by raw `scientificName` alone.

## IUCN status = always territory-tagged

GBIF's IUCN status is the **global** Red List. `getIucnFullLabel`
(client/src/lib/gbif.ts) always appends `IUCN_SOURCE_LABEL` ("Liste rouge
mondiale (UICN)") and distinguishes "non renseigné" (no GBIF data) from "NE"
(evaluated Not Evaluated). Compact badges show `label + " · mondiale"` with the
full label in `title`. **Why:** a global NT ≠ a regional NT; the spec forbids
bare "UICN NT" or bare "Non évalué".

## Potentiel d'enjeux ≠ risque biodiversité

The Synthèse card and report no longer show "Risque biodiversité X/100". It is
now qualitative "Potentiel d'enjeux écologiques" (Faible/Modéré/Élevé/Très
élevé) + a fixed disclaimer that real project risk needs project pressures.
The internal 0–100 `riskScore.score` still drives the ring fill only.
