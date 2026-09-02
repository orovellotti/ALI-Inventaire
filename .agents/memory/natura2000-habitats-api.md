---
name: Natura 2000 habitats & site polygons (EEA)
description: How to fetch habitat types and site polygons per Natura 2000 site for habitat-compatibility scoring.
---

# Natura 2000 habitats & site polygons

Two EEA ArcGIS layers complement `Natura2000Species` (used for designating species):

- **Habitats** — `ProtectedSites/Natura2000Habitats/MapServer/0/query`, geometry = Point (site centroid, not the habitat polygon). Useful fields: `HABITATCODE`, `DESCRIPTION`, `CONTAINSHABITAT_PERCENTAGE_COVER` (often null), `CONTAINSHABITAT_RELSURFACE`. Query by `SITECODE='FRxxxxxxx'`.
- **Sites** — `ProtectedSites/Natura2000Sites/MapServer/0/query`, geometry = **Polygon**. Fields: `SITECODE`, `SITENAME`, `Area_km2`. Request `returnGeometry=true&outSR=4326` → rings are `[lng, lat]` in EPSG:4326.

**Important:** the Sites layer is "Habitats Directive Sites (pSCI, SCI or SAC)" only — it does **NOT** contain ZPS (Birds Directive) sites. So EEA returns no polygon for ZPS. **Fix:** ZPS polygons come instead from the IGN WFS `patrinat_zps:zps` layer — `getNaturaZones()` requests geometry (pass a `center` to `fetchLayer`) and `fetchNaturaZones()` falls back to that WFS polygon when EEA has none, so birds get a real emprise/site overlap. Only sites with no polygon anywhere still use the proximity-only estimate.

**WFS axis order gotcha:** geopf.fr WFS with `OUTPUTFORMAT=application/json` returns GeoJSON in standard `[lng, lat]` order even though the BBOX uses `urn:ogc:def:crs:EPSG::4326` (lat,lng). Don't assume — `normalizeRings` in geoservices.ts auto-detects order by picking the interpretation whose first vertex is closest to the query center (robust incl. overseas).

**Why:** Phase 2 of the evidence engine — distinguish a species really expected in the study footprint (habitat overlaps the emprise → class C "très probable localement") from a mere mention of a large distant site (class B). See `server/services/natura2000Habitats.ts` + `habitatCompat.ts`.

**How to apply:** validate SITECODE (`/^[A-Z]{2}\d{6,}$/i`) before interpolating. Cache only non-empty results. When a Polygon or MultiPolygon project footprint exists, pass it through every potential/priority analysis and compute overlap from that footprint; use the circular study area only as an explicit fallback. Detect boundary intersections and containment before a bounded adaptive area estimate so thin or large overlaps cannot silently become zero. Ecological distance = per-taxon-group dispersal radius (birds ~10 km, plants ~500 m). Keep all fetches inside the existing time budget on the priority-species path (memory: priority-species-prefetch).

**Evidence ordering:** rank/display order is A, C, B, D, E (local relevance) — C outranks B so habitat-probable local species surface above distant-site mentions. Server `EVIDENCE_ORDER` and client `EVIDENCE_GROUP_ORDER`/report order must stay in lockstep.
