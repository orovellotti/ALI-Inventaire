---
name: EEA SDI download filtering
description: HTTP filtering behavior encountered when resolving public EEA SDI data-share downloads.
---

EEA SDI public data-share pages may return an XML `403 forbidden` response to Node’s default or tool-like HTTP profile even though the same public URL works in a browser.

**Why:** The SDI download resolver selects a different backend based on request headers. Browser-like `Accept`, `Accept-Language`, and user-agent headers reached the intended public Nextcloud share page; a minimal custom user-agent reached a protected catalogue endpoint instead.

**How to apply:** When resolving an official `sdi.eea.europa.eu/data/<record-id>` download, request HTML with browser-like content negotiation, then still validate the dataset identity, record ID, archive metadata, and package schema before trusting the downloaded file.