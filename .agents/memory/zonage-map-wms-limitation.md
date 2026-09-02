---
name: Zonage list↔map sync
description: Design decision — zonage list/map selection sync uses WFS GeoJSON vectors; WMS raster overlays are never selectable
---

Zonage list↔map selection sync is done with **vector emprises from the Géoplateforme WFS** (opt-in geometry on the zonage endpoint), drawn as Leaflet polygons with a shared stable key between list and map.

**Why:** the WMS raster overlays used as visual layers cannot support per-polygon click/highlight; earlier attempts to promise selection on them were dropped. A completion review also rejected flattening MultiPolygons — flattened rings render islands as holes in Leaflet.

**How to apply:** any zonage-on-map feature must use the WFS vector path, preserve Polygon/MultiPolygon nesting end to end (holes stay with their exterior part), preserve distinct homonyms in the shared identity, and degrade gracefully when the WFS returns no geometry. Never promise click behavior on WMS raster layers. Bbox axis quirk: see ign-geoplateforme-wfs.md.
