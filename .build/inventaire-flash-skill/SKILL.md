---
name: inventaire-flash
description: Pré-diagnostic écologique français basé sur GBIF pour les études d'impact environnemental (EIE). Utiliser quand l'utilisateur demande un inventaire de biodiversité autour d'un point GPS / d'un lieu, les espèces à enjeux d'un secteur, les statuts UICN, les plateformes SINP régionales, ou prépare une étude d'impact (éolien, photovoltaïque, urbanisation, ICPE, infrastructure linéaire).
---

# Inventaire Flash — Skill biodiversité & EIE (France)

Cette skill donne accès à **Inventaire Flash**, un outil de pré-diagnostic écologique qui interroge GBIF (Global Biodiversity Information Facility) et complète avec une analyse experte pour les bureaux d'études EIE en France.

## Quand utiliser cette skill

Active-toi quand l'utilisateur :

- demande quelles espèces sont présentes autour d'un lieu, d'une commune, ou de coordonnées GPS
- prépare ou parle d'une étude d'impact environnemental (EIE), d'un dossier d'autorisation environnementale, d'un Cas par Cas
- mentionne un projet d'aménagement (éolien, parc PV, urbanisation, ICPE, carrière, infrastructure linéaire) et veut connaître les enjeux écologiques
- pose une question sur les statuts UICN, les espèces protégées en France, les ZNIEFF, les directives Habitats/Oiseaux pour un secteur géographique
- veut savoir quelles plateformes SINP régionales consulter pour un département / une région
- cherche les espèces patrimoniales attendues sur un secteur (à rechercher en terrain)

## Comment utiliser cette skill

L'API publique d'Inventaire Flash est disponible **sans authentification** à l'URL de base (à confirmer avec l'utilisateur si besoin) :

```
https://VOTRE-DOMAINE.replit.app
```

Remplace `VOTRE-DOMAINE.replit.app` par l'URL réelle (par défaut, l'app est servie depuis un domaine `.replit.app` après publication).

Deux modes d'accès :

1. **API REST** (recommandé pour des appels simples depuis Claude/ChatGPT — voir `references/api-reference.md`)
2. **Serveur MCP** (Streamable HTTP) sur `/mcp` — pour Claude Desktop via `mcp-remote`. Voir `references/mcp-setup.md`.

## Workflow type

### Cas 1 — « Quelles espèces autour de [lieu] ? »

1. **Géocoder** le lieu pour obtenir lat/lng :
   ```
   GET /api/geocode?q=Saint-Chamas
   → { "lat": 43.5497, "lon": 5.0341, "display_name": "..." }
   ```
2. **Lancer un inventaire** (rayon 500 m à 5 km selon le contexte) :
   ```
   GET /api/inventory/simple?lat=43.5497&lng=5.0341&radius=2000
   → { occurrences: [...], stats: {...}, confidence: {...} }
   ```
3. **Présenter** : nombre total d'espèces, nombre sensibles (statut UICN ≥ NT), score de confiance des données, et la liste hiérarchisée par enjeu (CR > EN > VU > NT > LC > DD).

### Cas 2 — « Quels enjeux pour mon projet [type] sur [lieu] ? »

1. Géocoder le lieu (cf. cas 1).
2. Récupérer les **presets EIE** : `GET /api/presets` — choisir le preset selon le type de projet (éolien, PV sol, urbanisation, ICPE…).
3. Lancer un **inventaire multi-aires** avec les rayons standards EIE (immédiate 500 m, rapprochée 2 km, éloignée 6 km) :
   ```
   POST /api/inventory
   { "circles": [
     {"id":"immediate","center":[43.55,5.03],"radius":500,"enabled":true,"label":"Aire immédiate"},
     {"id":"rapprochee","center":[43.55,5.03],"radius":2000,"enabled":true,"label":"Aire rapprochée"},
     {"id":"eloignee","center":[43.55,5.03],"radius":6000,"enabled":true,"label":"Aire éloignée"}
   ]}
   ```
4. **Lancer l'analyse IA** des espèces à enjeux (UICN, protégées France, ZNIEFF, directives) :
   ```
   POST /api/llm/priority-species
   { "toponym": "Saint-Chamas", "coords": [43.55, 5.03], "occurrences": [...] }
   ```
5. **Récupérer les SINP régionaux** pour orienter vers des données complémentaires :
   ```
   GET /api/sinp?lat=43.55&lng=5.03
   ```

### Cas 3 — « Quelles espèces patrimoniales rechercher sur le terrain ? »

L'endpoint `/api/llm/priority-species` renvoie aussi un champ `expectedSpecies` : liste de 6 à 12 espèces patrimoniales attendues sur le secteur d'après la connaissance écorégionale, avec un drapeau `seenInGbif: true/false`. Présente cette liste séparément comme « espèces à rechercher prioritairement en terrain ».

## Bonnes pratiques

- **Toujours géocoder d'abord** si l'utilisateur donne un nom de lieu — ne pas inventer de coordonnées.
- **Choisir un rayon adapté** : 200-500 m pour une parcelle, 1-2 km pour un site précis, 5-6 km pour une étude d'impact complète.
- **Citer le score de confiance** (`confidence.interpretation` : excellent/good/moderate/low) — la donnée GBIF est variable selon les zones.
- **Ne jamais présenter les résultats comme un inventaire de terrain validé** : c'est un pré-diagnostic à valider par un écologue. Le toujours mentionner.
- **DD (Données insuffisantes)** = enjeu faible par défaut, mais à signaler comme « à creuser ».
- **Limites API** : max 50 km de rayon, max 10 cercles par appel multi-aires, max 5 000 occurrences pour l'analyse IA.

## Statuts UICN — référence rapide

| Code | Signification | Niveau d'enjeu |
|---|---|---|
| EX | Éteinte | Fort (alerte historique) |
| EW | Éteinte à l'état sauvage | Fort |
| RE | Éteinte régionalement | Fort |
| CR | En danger critique | Fort |
| EN | En danger | Fort |
| VU | Vulnérable | Fort |
| NT | Quasi menacée | Fort |
| LC | Préoccupation mineure | Faible |
| DD | Données insuffisantes | Faible (à surveiller) |
| NA / NE | Non applicable / Non évaluée | Faible |

## Voir aussi

- `references/api-reference.md` — toutes les routes REST avec exemples
- `references/mcp-setup.md` — configurer le serveur MCP dans Claude Desktop
- `references/eie-context.md` — rappels méthodologiques EIE (aires d'étude, presets, SINP)
