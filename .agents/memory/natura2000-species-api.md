---
name: Natura 2000 designating-species API (EEA)
description: How to fetch designating species per Natura 2000 site by SITECODE, and where the site code comes from.
---

# Natura 2000 designating species

To list the species that justify a Natura 2000 site (FSD / "espèces désignatrices"), use the EEA public ArcGIS REST service — NOT DiscoData (its SQL schema is opaque/403s on catalog endpoints, table names are version-tagged and undiscoverable).

- Endpoint: `https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Species/MapServer/0/query`
- Query: `where=SITECODE='FR9400597'&outFields=SpeciesNameClean,CONTAINSSPECIES_SPECIESNAME,CONTAINSSPECIES_SENSITIVE&returnGeometry=false&f=json`
- `SpeciesNameClean` is the clean binomial; `CONTAINSSPECIES_SPECIESNAME` is the raw fallback. `CONTAINSSPECIES_SENSITIVE=='1'` means data-sensitive.
- `CONTAINSSPECIES_MOTIVATION` encodes annex + population grade, e.g. `"II,C"`, `"IV,C"`, or bare `"D"`. Parse the single-letter A–D token as the **grade**; grade `D` = population non-significative (species merely present, NOT designating). Grade A/B/C (or annex present, no grade) = significant designating species. Population/conservation/isolation columns are NULL in this dataset — motivation is the only importance signal.
- Layer 0 = Species; table 3 = "List of Species". Whole-Europe coverage.

**Where the SITECODE comes from:** the IGN Géoplateforme WFS Natura 2000 layers (patrinat_sic, patrinat_zps) expose it as property `id_mnhn` (e.g. `FR9400597`), and it's also embedded in `url_fiche` (`.../site/natura2000/FR9400597`). `id_local` is null for N2000, so don't rely on it for the code.

**Why:** user (ecologist) wanted designating species to refine the enjeux in the AI priority-species analysis.

**How to apply:** validate the code (`/^[A-Z]{2}\d{6,}$/i`) before interpolating into the `where` clause (regex is the injection guard). Cache only non-empty responses. When fanning out over many nearby sites, use a bounded worker pool + overall time budget — a location can return 5+ Natura sites and unbounded `Promise.all` stalls `/api/llm/priority-species`.
