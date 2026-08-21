---
name: Species–habitat ecological reference
description: Scientific guardrails for deterministic potential-species compatibility scoring.
---

Only produce a compatibility score when the species and at least one associated Natura 2000 habitat share an exact ecological-group code in the EEA DAT-143 expert reference. If the species reference, habitat mapping, geometry, or any associated site's evidence is missing, return `Non évaluée` with no score. A real observation is a separate fact and must not change the compatibility score.

**Why:** A Natura 2000 species and habitat co-occurring in the same site record is not evidence that the species uses that habitat locally. DAT-143 supplies the explicit expert association, but the available habitat descriptions remain site-level and do not locate the habitat inside the study area.

**How to apply:** Keep scores capped below the “Très probable localement” threshold while only site-level habitat data are available. Mark “observée” only for a sourced occurrence whose coordinates fall within the exact requested radius.