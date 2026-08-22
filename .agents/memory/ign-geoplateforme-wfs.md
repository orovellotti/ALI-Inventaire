---
name: IGN Géoplateforme WFS (zonages)
description: Quirks of the data.geopf.fr PatriNat WFS used for environmental zonings (ZNIEFF, Natura 2000, réserves…).
---

# IGN Géoplateforme WFS — PatriNat zonages

Base: `https://data.geopf.fr/wfs/ows`, WFS 2.0.0. Layers are `patrinat_*` (MNHN/PatriNat).

- **BBOX axis order for EPSG:4326 is lat,lng,lat,lng** and must pass `urn:ogc:def:crs:EPSG::4326` as the CRS. Getting axis order wrong returns empty/wrong features silently.
- Feature props of interest: `nom_site` (name), `url_fiche` (INPN link, e.g. inpn.mnhn.fr/espace/protege/...), `id_local`.
- **Layer typenames do NOT always match their theme.** The Ramsar layer is genuinely served as `patrinat_ramsar:pnm` (workspace `patrinat_ramsar`, internal table `pnm`), and its feature ids look like `pnm.N`. It really does return Ramsar sites (verified: "Basse Mana", "Marais De Kaw"). Do **not** "fix" this to `patrinat_ramsar:ramsar` — that typename does not exist and errors out. **Why:** a code reviewer flagged it as a copy-paste bug; it is not. Confirm any suspected typename bug against GetCapabilities before changing it.
- To discover real typenames: `GetCapabilities` then grep for `patrinat_<theme>:...`.
- **Paginate large WFS results and verify real progress.** `COUNT` truncates without error; follow `numberMatched` with `STARTINDEX`, but treat null/`unknown` as absent and detect repeated pages by stable feature/zone IDs. **Why:** a 50 km ZNIEFF query around Paris returned 603 zones, far above the former 50-row default; some WFS servers may ignore pagination offsets. **How to apply:** cap work explicitly, mark results partial on caps/errors/repeated pages, and never infer completeness from the raw returned-row counter alone.
