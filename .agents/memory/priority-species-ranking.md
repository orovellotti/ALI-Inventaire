---
name: Priority-species top-N reserves Natura 2000 slots
description: Why the espèces-à-enjeux final list reserves slots for Natura 2000 class C/B species
---

# Espèces à enjeux — réservation de places Natura 2000

The priority-species final list is capped at `MAX_FINAL_SPECIES` and sorted by
evidence class first (A observed, then C, B, D, E) then score. When the study
area already has ≥ MAX_FINAL_SPECIES observed species (class A), the Natura 2000
site-derived species (class C "très probable localement", class B "avéré au
site") are always sorted below the As and sliced off — so the whole Natura 2000
contribution becomes invisible in the UI.

**Rule:** the final selection reserves up to `NATURA_RESERVED_SLOTS` places for
class C/B species (`server/llm.ts`, in `analyzePrioritySpecies` around the
`ranked`/`reserved`/`filler` block), then fills the rest with the top-ranked
species, before ALI enrichment.

**Why:** users (ecologists) expect nearby Natura 2000 designating species to
surface even when local observations already fill the list — that is the point
of pulling Natura 2000 data. A pure evidence-then-score top-N hides them.

**How to apply:** if you touch the final ranking/slicing, keep the reservation
or the Natura 2000 species disappear again whenever an area is observation-rich.
Reserved species must be part of the slice sent to ALI enrichment.

## Libellés de classe de preuve — 3 emplacements à synchroniser

Evidence-class labels (A "Espèce observée", B "Avérée à l'échelle du site",
C "Très probable localement", D "Potentielle", E "Peu pertinente localement")
are duplicated in THREE places and must be edited together:
- `server/llm.ts` → `EVIDENCE_LABELS` (per-species `evidenceLabel`)
- `client/src/components/PrioritySpeciesInline.tsx` → `EVIDENCE_GROUP_LABEL` (+ `EVIDENCE_GROUP_DESC`)
- `client/src/components/ResultsPanel.tsx` → inline `label` map in the copyable/exported report

**Why:** no shared source; a change in one place silently desyncs the UI panel,
the exported report, and the per-species badge.
