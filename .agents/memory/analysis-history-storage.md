---
name: Local analysis history
description: Persistence and restoration constraints for saved analysis conversations.
---

Analysis conversations are complete browser-local snapshots in IndexedDB, limited to the 20 most recent entries. Do not add accounts, server persistence, or cross-device synchronization unless the user explicitly changes this product decision. Restoring a saved conversation must use its stored scientific results and geometries rather than rerunning the analysis APIs.

**Why:** Scientific result payloads and detailed geometries can exceed reliable localStorage capacity, while users need completed work to survive reloads without changing because an upstream source has evolved.

**How to apply:** Any new analysis input or result needed to reconstruct the conversation, map, filters, tables, or exports must be included in the versioned snapshot. Handle storage failures visibly without blocking a live analysis.