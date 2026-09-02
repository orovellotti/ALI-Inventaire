---
name: Final study structured context
description: Required data contract between app-generated analysis results and the final study LLM call.
---

The final study model call must receive a canonical structured context in addition to the readable source report. The context covers the request and study areas, inventory and confidence, ALI Species, zonages, CARHAB, potential species, ZNIEFF, Natura 2000, harness traces, filters, errors, and partial states.

**Why:** A detailed system prompt cannot compensate for analysis data that never reaches the model. The previous flow sent mainly the UI summary and silently omitted several generated datasets.

**How to apply:** Keep the context deduplicated and size-bounded. Each bounded collection must expose totalCount and omittedCount, and the final prompt must describe any abridged section as partial rather than exhaustive. The structured context prevails over the editorial summary.