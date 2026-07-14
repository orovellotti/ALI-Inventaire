---
name: ALI Species (alispecies.io) linking
description: How to link species to ALI Species reliably and why the server redirect is slow
---

# ALI Species (alispecies.io) linking

**Prefer a direct client-side link to `https://alispecies.io/?q=<scientificName>`** for
per-species "open on ALI" links. That URL auto-runs the search and lands on the taxon
results; it needs no server round-trip.

**Why:** alispecies.io responds in ~9-10s to server-side Node `fetch` (though it's fast
from plain curl), so routing species links through our `/api/ali/redirect` resolver made
every click wait ~10s and time out → HTTP 500. The `cdNom` field on `Occurrence` is
declared but never populated by the GBIF/iNat enrichment, so the nicer
`/taxon/{cdNom}` deep-link cannot be built client-side.

**How to apply:** keep `/api/ali/redirect` (used by the AI priority-species section, which
carries a precomputed `aliUrl`) but wrap the resolve in try/catch that falls back to
`https://alispecies.io/?q=<q>` so it never returns 500. For the main species list, link
straight to the `?q=` search URL. If `cdNom` ever gets populated, prefer
`https://alispecies.io/taxon/{cdNom}`.
