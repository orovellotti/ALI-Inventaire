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
