---
name: Priority-species external prefetch latency
description: Why the Natura 2000 prefetch before the AI call is time-bounded and layer-limited
---

# Priority-species external prefetch latency

Any external data fetch that runs *before* the OpenAI call in `analyzePrioritySpecies`
(server/llm.ts) must be strictly time-bounded and scoped to the minimum layers needed.

**Why:** `getZonages()` queries 17 IGN Géoplateforme WFS layers with a per-layer 9s
timeout; worst-case degraded path is ~27s of pure wait before the LLM even starts.
Doing that synchronously in the AI path turns an IGN slowdown into a user-visible AI
regression, even though the graceful catch keeps it functionally "working".

**How to apply:** the Natura prefetch uses `getNaturaZones()` (natura2000 layers only,
2 layers) wrapped in a `Promise.race` against `NATURA_FETCH_TIMEOUT_MS` (4s) that
resolves to `[]`. If you add more pre-LLM enrichment, follow the same pattern:
dedicated narrow query + hard timeout + empty-array fallback. Never call full
`getZonages()` on the AI request path.
