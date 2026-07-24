---
name: Invasive alien species (EEE) handling
description: Why/where EEE are neutralized so they never appear as conservation enjeux
---

# Espèces exotiques envahissantes (EEE)

`isInvasiveExotic(scientificName)` (server/invasive.ts) is the single source of
truth for EEE detection — a hand-maintained list of invasive genera + binomials
(métropole). It is applied on TWO independent paths that must stay consistent:

1. **Inventory list** — `getPatrimonialite(iucn, alert, isInvasive)`
   (client/src/lib/gbif.ts) returns level 0 / "Exotique envahissante" when the
   occurrence carries `isInvasive`.
2. **Priority-species engine** — `classifyAndScore` (server/llm.ts) sets
   `statutScore = 0`, clears `patrimonialite`, clamps `score` to ≤ 20, forces
   `level = "modéré"`, sets `isInvasive` flag + scoreLabel, and the LLM prompt
   forbids rating EEE fort/majeur. Client `PrioritySpeciesInline` shows a
   fuchsia "EEE · enjeu de gestion" badge INSTEAD of the numeric "Enjeu X/100",
   and the copyable report prints an EEE marker instead of the score.

**Why:** an EEE's GBIF/UICN status reflects its *native* range, not local
conservation value. Before the fix, Agave vivipara (genus in the list) scored as
"enjeu fort" on occurrence/UICN alone — the opposite of reality (EEE are a
management concern, not a patrimonial enjeu).

**How to apply:** if you add a new place an EEE could surface as an enjeu, gate
it on `isInvasiveExotic` / the `isInvasive` flag. Never let the numeric enjeu
score drive EEE display. To cover a missing species, add its genus or binomial
to server/invasive.ts (both paths pick it up).
