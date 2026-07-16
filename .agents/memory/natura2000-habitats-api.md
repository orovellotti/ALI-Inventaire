---
name: Natura 2000 habitats & site polygons (EEA)
description: How to fetch habitat types and site polygons per Natura 2000 site for habitat-compatibility scoring.
---

# Natura 2000 habitats & site polygons

Two EEA ArcGIS layers complement `Natura2000Species` (used for designating species):

- **Habitats** — `ProtectedSites/Natura2000Habitats/MapServer/0/query`, geometry = Point (site centroid, not the habitat polygon). Useful fields: `HABITATCODE`, `DESCRIPTION`, `CONTAINSHABITAT_PERCENTAGE_COVER` (often null), `CONTAINSHABITAT_RELSURFACE`. Query by `SITECODE='FRxxxxxxx'`.
- **Sites** — `ProtectedSites/Natura2000Sites/MapServer/0/query`, geometry = **Polygon**. Fields: `SITECODE`, `SITENAME`, `Area_km2`. Request `returnGeometry=true&outSR=4326` → rings are `[lng, lat]` in EPSG:4326.

**Important:** the Sites layer is "Habitats Directive Sites (pSCI, SCI or SAC)" only — it does **NOT** contain ZPS (Birds Directive) sites. So bird (ZPS) sites return no polygon; habitat-compat must fall back to a proximity-only estimate for those.

**Why:** Phase 2 of the evidence engine — distinguish a species really expected in the study footprint (habitat overlaps the emprise → class C "très probable localement") from a mere mention of a large distant site (class B). See `server/services/natura2000Habitats.ts` + `habitatCompat.ts`.

**How to apply:** validate SITECODE (`/^[A-Z]{2}\d{6,}$/i`) before interpolating. Cache only non-empty results. Overlap ratio = deterministic sampling of the study disk against the polygon (point-in-polygon), NOT true area intersection. Ecological distance = per-taxon-group dispersal radius (birds ~10 km, plants ~500 m). Fold both into a 15 % "habitat" score weight. Keep all fetches inside the existing time budget on the priority-species path (memory: priority-species-prefetch).

**Evidence ordering:** rank/display order is A, C, B, D, E (local relevance) — C outranks B so habitat-probable local species surface above distant-site mentions. Server `EVIDENCE_ORDER` and client `EVIDENCE_GROUP_ORDER`/report order must stay in lockstep.
