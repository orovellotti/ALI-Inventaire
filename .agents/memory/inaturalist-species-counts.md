---
name: iNaturalist species counts
description: Scientific interpretation of the aggregated iNaturalist species_counts response used by Inventaire Flash.
---

# iNaturalist species counts

Treat iNaturalist `species_counts` results as a taxon-level signal aggregated for the requested centre and radius, not as individually georeferenced occurrence points.

**Why:** the aggregate supplies taxa and observation counts but not the coordinates of each underlying observation. Assigning the search centre to the result is a display/normalization convenience and does not constitute independent spatial verification.

**How to apply:** public explanations must distinguish individually re-filtered GBIF coordinates from the iNaturalist centre/radius aggregate. Do not claim that Inventaire Flash retrieves or re-filters each iNaturalist observation coordinate unless the integration is changed to use the individual-observations endpoint.