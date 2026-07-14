---
name: ALI Species (alispecies.io) API quirks
description: Undocumented behavior of the ALI / TAXREF API used to enrich species statuses
---

ALI Species (https://alispecies.io) wraps the French TAXREF reference. Used to enrich
priority species ("espèces à enjeux") with regulatory statuses.

- Search: `GET /api/taxons/search?q={name}&limit=5` returns a JSON **array** whose fields are
  **camelCase** (`cdNom`, `cdRef`, `lbNom`, `nomVern`, `rang`). There is NO `is_reference`/snake_case.
  Pick the valid taxon via `rang === "ES"`, fall back to `hits[0]`. Use `cdRef` for the canonical taxon.
- Taxon detail: `GET /api/taxons/{cdNom}` — basic fields only (`fr` = simplified national protection flag).
- **Statuses: `GET /api/taxons/{cdNom}/statuts`** — the rich endpoint. Returns an array of rows with
  `cdTypeStatut`, `regroupementType`, `codeStatut`, `labelStatut`, `lbAdmTr` (scope), `niveauAdmin`, `docUrl`.
  Status type codes: LRM/LRE/LRN/LRR (red lists, codeStatut = IUCN code), PN/PR/PD (protection),
  DH/DO (directives, annexe in labelStatut), BERN/BONN (conventions), ZDET (ZNIEFF déterminante, code="true"),
  PNA/exPNA (plans), and noise types REGL/REGLSO/REGLII/SENSNAT/SENSREG.

**Why these bite:**
- **Regional/territorial statuses repeat per region** — ZDET and LRR have one row per French region
  (~13+ rows). Dedupe presence-flags by category+value (drop scope); for red lists keep the worst
  severity. Forgetting this dumped ~20 identical "ZNIEFF déterminante" badges in the UI.
- **Red-list severity must include EX/EW/RE**, not just CR/EN/VU/NT — `RE` (regionally extinct) is
  more severe than CR and appears on LRR; filtering only "CR/EN/VU/NT" silently drops it.
- **SENSNAT/SENSREG = data-diffusion sensitivity, NOT a conservation enjeu** — exclude from
  "espèces à enjeux". REGL* = misc regulation (hunting, IAS introduction); exPNA = finished plan.

**How to apply:** when fetching ALI statuts concurrently for several species (e.g. 5 priority species
= 10 outbound calls), cache ONLY successful fetches. Caching transient network/timeout failures
(null hit / empty array) poisons the cache for the whole TTL and produces intermittent missing
enrichment. Let errors propagate, limit concurrency (~3), and retry once.

**Patrimonialité score (the real ALI one):** ALI computes it purely from the `/statuts` rows, no
extra call. Formula (reverse-engineered from their JS bundle): `score = round(100 * (0.5*ecologique
+ 0.3*reglementaire + 0.2*territorial))`. ecologique = worst red-list severity normalized; reglementaire
= protection/directives presence; territorial = ZNIEFF déterminante / PNA presence. Levels:
`>=75 majeure, >=50 forte, >=25 modérée, else faible`. Replicated in `computePatrimonialite()` in
server/ali.ts. Only feasible for priority species (needs statuts), NOT the full occurrence list.

**Latency trap:** the `/api/taxons/search` endpoint (AI-powered, resolves name→cdNom) is the slow one
— sequentially it takes ~1-13s per call, while `/statuts` stays fast (~180ms) once cdNom is known.
ALI sends **no CORS headers**, so the browser can't call it cross-origin. Enrichment must stay
server-side; wrap the whole enrichment pass in a global time budget (~40s) via Promise.race so a slow
search never blocks/timeouts the entire /api/llm/priority-species response — degrade to un-enriched
species instead. TAXREF (taxref.mnhn.fr) is not a reliable fallback (returns 521).

**CRITICAL — search CANNOT be called concurrently.** The AI search endpoint saturates under parallel
load: firing 5 requests at once makes ALL of them time out (verified: 5 parallel all abort even at
45s), while the exact same 5 run sequentially all succeed in ~26s total. Enrich strictly
one-at-a-time (`ALI_CONCURRENCY = 1` in server/llm.ts). Raising concurrency to "speed it up" does the
opposite — it breaks enrichment entirely. Per-call timeout must cover the slow tail (`TIMEOUT_MS ≈ 20s`
in aliApi.ts) since a single search can hit ~13s.
**Why:** debugged a case where patrimonialité/statuts silently came back empty for every species; root
cause was concurrent search calls all timing out, NOT the timeout value or the formula.
