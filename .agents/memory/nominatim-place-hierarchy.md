---
name: Nominatim place hierarchy
description: How to interpret and present Nominatim address levels in ALi location labels.
---

Do not present Nominatim `municipality` or `state_district` as the commune selected by the user. Build concise labels from the named local place, a distinct village/town/city when available, the department (`county`), and the region (`state`).

**Why:** In France, Nominatim may use `municipality` for a higher administrative territory or arrondissement. For example, a valid commune search can otherwise display an unrelated-looking administrative centre.

**How to apply:** Keep the raw provider hierarchy available only as documentary context. User-facing location confirmations and study prompts must use the normalized concise label. For small hamlets, encourage adding the commune or department because gazetteer coverage and ranking depend on OpenStreetMap contributions.