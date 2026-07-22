---
name: EEA Natura 2000 bulk data + directive/annex source
description: How to download the EEA Natura2000 tabular DB, and where "DIRECTIVESPECIES" (directive+annex per species) actually comes from.
---

# EEA Natura 2000 bulk tabular download

The old legacy download URLs (`www.eea.europa.eu/data-and-maps/data/ga-downloads/...`) now return an empty React SPA — dead for scripting. The real files live on the EEA datastore behind a Nextcloud public share:

- Resolve the dataset's SDI catalogue record: `https://sdi.eea.europa.eu/catalogue/srv/api/records/<uuid>` (JSON/XML) — its distribution links point to `https://sdi.eea.europa.eu/webdav/datastore/public/<folder>` which redirects to a Nextcloud share token.
- The share token for the whole public datastore is currently `sptXqwkQr5g7Bp5`. List/download via **Nextcloud public WebDAV**: `curl -u "<token>:" -X PROPFIND -H "Depth: 1" https://sdi.eea.europa.eu/datashare/public.php/webdav/<folder>/`. The plain `.../s/<token>/download` folder-zip endpoint hangs; per-file WebDAV GET works and is fast.
- Folder naming: `eea_t_natura2000_p_<year>_v01_r01` (`t`=tabular; latest year/rev wins). Contains `Natura2000_end2024_rev1_csv.zip` (10 CSVs), the `.mdb`, and `Natura2000-TableDefinition.xlsx`.

# "DIRECTIVESPECIES" does NOT exist in the Natura2000 tabular DB

Both the CSV package and the `.mdb` contain only 10 SDF tables: BIOREGION, DESIGNATIONSTATUS, HABITATCLASS, HABITATS, IMPACT, MANAGEMENT, METADATA, NATURA2000SITES, OTHERSPECIES, SPECIES. There is **no DIRECTIVESPECIES table** (Discodata has no raw SDF tables either). `SPECIES.csv` join key = `SITECODE`; it carries `SPECIESCODE` (birds = `A####`, habitats species = numeric) and `SPGROUP`, but no directive/annex.

**Directive + annex per species** must come from EUNIS: `[EUNIS].[latest].[Species_Legal_Status]` on Discodata (`https://discodata.eea.europa.eu/sql?query=...&p=N&nrOfHits=1000`, paginate). Its `code_2000` == the SDF `SPECIESCODE`; filter `dc_index_reference_title` to `92/43/EEC` (Habitats) and the wild-birds directives (`79/409/EEC` + `2009/147/EC`), parse the annex roman numeral from `dc_index_title` with `Annex\s+([IVX]+)`. Caveat: migratory birds (art. 4.2) are NOT annex-listed, so ~15k bird rows have no EUNIS match — infer Birds Directive from the `A####` code prefix. ~5k habitats-group "important species" (fish/reptiles/plants) legitimately have no directive (SDF section 3.2, non-annex) — leave blank.

## Seeding CSV into Postgres via a transaction — readline gotcha

When bulk-loading a big CSV into Postgres inside a single `db.transaction`, create the `readline`/`createReadStream` **inside** the transaction callback, right before the `for await` loop. If you create the stream before `await`ing the transaction BEGIN/DELETE, readline goes into flowing mode and emits (and drops) the earliest lines — including the header row — during that await. Symptom: fewer lines read than the file has and 0 rows matched (header lost → column-index map empty), and since the DELETE already committed, the table ends up **empty**. Keep stream creation adjacent to consumption.

**mdbtools** isn't preinstalled; `nix-env -iA nixpkgs.mdbtools` builds it but doesn't add it to PATH — call the binary directly from `/nix/store/*mdbtools-1.0.1/bin/mdb-tables`.
