---
name: ALI Species (alispecies.io) linking
description: How to build ALI Species species-page links reliably
---

# ALI Species (alispecies.io) linking

**Best link is `https://alispecies.io/taxon/{cdNom}`.** The site is a SPA that
canonicalizes by the *leading numeric cdNom* in the `/taxon/...` path — the slug is
cosmetic. `/taxon/59`, `/taxon/59-euproctus-montanus`, and even a wrong slug
`/taxon/59-euproctus-montanus-savi-1838` all render the correct fiche (client-side rewrite
to the canonical slug). So a bare `/taxon/{cdNom}` is enough; no slug needed.

**Do NOT fall back to `https://alispecies.io/?q=<name>`** — that lands on the ALI
*homepage* with a query, not a species page. That was the "ALI link doesn't work / should
point to the species page" bug. When `cdNom` is missing, fall back to our
`/api/ali/redirect?q=<name>` resolver instead: it runs the ALI search server-side and 302s
to a real `/taxon/{cdNom}-...` fiche.

**cdNom source & gotchas:**
- `Occurrence.cdNom` IS populated (via `fetchTaxRefCdNom` in enrichment); when TaxRef
  fails (it 521s intermittently) cdNom is undefined → use the redirect resolver fallback.
- ALI search endpoint `/api/taxons/search` returns `lbNom` *with author* (e.g.
  "Euproctus montanus (Savi, 1838)"); the *detail* endpoint `/api/taxons/{cdNom}` returns
  `lbNom` *clean*. So slugs built from search results carry the author — harmless because
  the SPA resolves by cdNom anyway.

**How to apply:** priority-species links carry a precomputed `aliUrl` (from enrichment) and
fall back to `/api/ali/redirect`; the occurrence list links to `/taxon/{cdNom}` when cdNom
exists, else `/api/ali/redirect?q=<name>`. Keep the redirect route wrapped in try/catch.
