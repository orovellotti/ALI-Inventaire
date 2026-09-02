---
name: ALI Species enrichment order
description: Required position of ALI Species in the inventory-analysis sequence.
---

ALI Species is a downstream enrichment service, not an initial inventory source. It must run only after occurrences have been collected, merged, filtered, and deduplicated.

**Why:** ALI Species qualifies the territorial and regulatory status of taxons already retained in the inventory. Showing or invoking it with the initial source searches misrepresents its role and can imply that it supplies occurrence data.

**How to apply:** In execution pipelines, progress indicators, transcripts, and reports, place ALI Species after inventory consolidation and before the final coherence check or synthesis.