---
name: CARHAB output semantics
description: Scientific interpretation rules for displaying ALI Habitat / CARHAB area summaries.
---

CARHAB returns an area analysed plus habitat codes, labels, areas and percentages. Display these values as supplied by CARHAB, deduplicated by habitat code and sorted by decreasing area.

**Why:** The figures are useful for prioritising habitats, but ALi does not receive enough geometry to independently certify polygon intersections or field presence.

**How to apply:** Keep the same normalized summary in the interface and report. Attribute every figure to CARHAB and state that it is documentary, not a field habitat map or confirmation within the works footprint.

Treat the official habitat map backdrop as independent source cartography, not as polygons returned by the ALI summary or as a visual proof of the summary's area calculations.

**Why:** The map can load during analysis, before the summary exists, and its coverage and geographic extent can differ from that summary.

**How to apply:** Keep attribution and coverage limitations visible; a blank source tile must never be described as an absence of habitats.