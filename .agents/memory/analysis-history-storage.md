---
name: Local analysis history
description: Persistence and restoration constraints for saved analysis conversations.
---

Analysis conversations are complete browser-local snapshots in IndexedDB, limited to the 20 most recent entries. Do not add accounts, server persistence, or cross-device synchronization unless the user explicitly changes this product decision. Restoring a saved conversation must use its stored scientific results and geometries rather than rerunning the analysis APIs.

Clear all saved conversations on the first browser load of every newly published build. Keep them across ordinary reloads within the same publication.

**Why:** Scientific result payloads and detailed geometries can exceed reliable localStorage capacity. Users need stable reloads within one publication, but explicitly require a clean history after each republish.

**How to apply:** Store the published-build marker atomically in IndexedDB rather than localStorage. Include every reconstruction input in the snapshot, and never rerun scientific APIs when restoring history.