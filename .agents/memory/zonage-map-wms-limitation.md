---
name: Zonage list↔map sync limitation
description: Why zonage list/map selection sync is impossible with the current WMS raster overlay approach
---

Zonage overlays on the map are IGN Géoplateforme **WMS raster tiles**, not vector features. No per-polygon click/highlight is possible.

**Why:** the 2026-08 UX refonte required list↔map zonage sync; it was skipped as a documented limitation (spec allowed it).

**How to apply:** to implement sync (task exists), fetch geometries via **WFS GeoJSON** from data.geopf.fr for the listed zonages and render Leaflet polygons — remember the EPSG:4326 lat,lng bbox order quirk (see ign-geoplateforme-wfs.md). Don't promise selection behavior on the WMS layers.
