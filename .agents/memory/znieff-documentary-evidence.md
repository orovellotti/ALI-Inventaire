---
name: ZNIEFF documentary evidence
description: Scientific interpretation and source semantics for species listed in the national PatriNat ZNIEFF reference database.
---

# ZNIEFF documentary evidence

Treat a species linked to a ZNIEFF as **documented at the scale of that inventory zone**. It is not proof of a recent occurrence inside the study footprint, and it must not alter the Natura 2000 / EEA habitat-compatibility score.

**Why:** ZNIEFF records come from territorial inventories whose spatial and temporal precision differs from georeferenced GBIF/iNaturalist occurrences. Combining these signals would overstate local presence.

**How to apply:** expose ZNIEFF as a separate documentary evidence family. Only an independently georeferenced occurrence inside the exact study radius may produce an “observed” signal.

The official public PatriNat archive joins WFS `id_mnhn` to `REF_ESPECE.NM_SFFZN`. Preserve the official determination statuses:

- `D`: espèce déterminante;
- `E`: autre espèce à enjeux;
- `A`: autre espèce documentée;
- `C`: confidentielle — never expose or reconstruct it from the public dataset.

**Why:** these categories have distinct expert meanings. Collapsing them loses the reason a taxon matters to the zone, while exposing `C` would violate the source’s confidentiality model.

**How to apply:** prioritize D, then E, then A in displays; reject unknown statuses instead of silently treating them as A. Refresh the large national archive through a staging table and a short atomic swap so live documentary reads remain available.