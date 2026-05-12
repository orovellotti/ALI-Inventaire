---
name: inventaire-flash
description: Pré-diagnostic écologique français basé sur GBIF pour les études d'impact environnemental (EIE). Utiliser quand l'utilisateur demande un inventaire de biodiversité autour d'un point GPS / d'un lieu, les espèces à enjeux d'un secteur, les statuts UICN, les plateformes SINP régionales, ou prépare une étude d'impact (éolien, photovoltaïque, urbanisation, ICPE, infrastructure linéaire). Cette skill utilise le serveur MCP Inventaire Flash.
---

# Inventaire Flash — Skill biodiversité & EIE (France)

Cette skill donne accès à **Inventaire Flash** via son serveur **MCP** (Model Context Protocol). L'outil interroge GBIF (Global Biodiversity Information Facility) et complète avec une analyse experte pour les bureaux d'études EIE en France.

## Quand utiliser cette skill

Active-toi quand l'utilisateur :

- demande quelles espèces sont présentes autour d'un lieu, d'une commune, ou de coordonnées GPS
- prépare ou parle d'une étude d'impact environnemental (EIE), d'un dossier d'autorisation environnementale, d'un Cas par Cas
- mentionne un projet d'aménagement (éolien, parc PV, urbanisation, ICPE, carrière, infrastructure linéaire) et veut connaître les enjeux écologiques
- pose une question sur les statuts UICN, les espèces protégées en France, les ZNIEFF, les directives Habitats/Oiseaux pour un secteur géographique
- veut savoir quelles plateformes SINP régionales consulter pour un département / une région
- cherche les espèces patrimoniales attendues sur un secteur (à rechercher en terrain)

## Prérequis : connecter le serveur MCP

Le serveur MCP est exposé en **Streamable HTTP, stateless, sans authentification** sur :

```
https://VOTRE-DOMAINE.replit.app/mcp
```

Remplace `VOTRE-DOMAINE.replit.app` par l'URL réelle de ton instance Inventaire Flash.

Voir `references/mcp-setup.md` pour la configuration dans Claude Desktop, Cursor, ou tout client MCP.

## Outils MCP disponibles

| Outil | Description courte |
|---|---|
| `geocode` | Convertir un nom de lieu en coordonnées GPS (Nominatim) |
| `inventory_simple` | Inventaire GBIF autour d'un point (lat, lng, radius en m) |
| `inventory_multi` | Inventaire EIE multi-aires concentriques (1 à 10 cercles) |
| `species_details` | Fiche d'une espèce (nom vernaculaire FR, UICN, image) |
| `sinp_links` | Plateformes SINP régionales pour un point GPS |
| `priority_species_for_location` | Inventaire + analyse IA des espèces à enjeux + espèces attendues |
| `list_reference_data` | Référentiels embarqués (presets EIE, aires, groupes taxo, SINP complet) |

Détails complets dans `references/mcp-tools.md`.

## Workflow type

### Cas 1 — « Quelles espèces autour de [lieu] ? »

1. Appeler `geocode` avec `q: "Saint-Chamas"` → récupérer `lat`, `lng`.
2. Appeler `inventory_simple` avec `lat`, `lng`, `radius: 2000`.
3. Présenter : nombre total d'espèces, nombre sensibles (UICN ≥ NT), score de confiance, et la liste hiérarchisée par enjeu (CR > EN > VU > NT > LC > DD).

### Cas 2 — « Quels enjeux pour mon projet [type] sur [lieu] ? »

1. Appeler `geocode` pour le lieu.
2. Appeler `list_reference_data` avec `kind: "presets"` pour récupérer les rayons standard du type de projet (éolien, PV sol, urbanisation, ICPE…).
3. Appeler `inventory_multi` avec les 3 cercles EIE (immédiate / rapprochée / éloignée) construits depuis le preset.
4. Appeler `priority_species_for_location` avec le toponyme et les coordonnées pour obtenir l'analyse IA.
5. Appeler `sinp_links` pour orienter l'utilisateur vers les sources de données régionales complémentaires.

### Cas 3 — « Quelles espèces patrimoniales rechercher sur le terrain ? »

`priority_species_for_location` renvoie un champ `analysis.expectedSpecies` : 6 à 12 espèces patrimoniales attendues sur le secteur d'après la connaissance écorégionale, avec un drapeau `seenInGbif: true/false`. Présente cette liste comme « espèces à rechercher prioritairement en terrain ».

## Bonnes pratiques

- **Toujours appeler `geocode` d'abord** si l'utilisateur donne un nom de lieu — ne pas inventer de coordonnées.
- **Choisir un rayon adapté** : 200-500 m pour une parcelle, 1-2 km pour un site précis, 5-6 km pour une étude d'impact complète. Maximum 50 km par appel.
- **Citer le score de confiance** (`confidence.interpretation` : excellent/good/moderate/low) — la donnée GBIF est variable selon les zones.
- **Ne jamais présenter les résultats comme un inventaire de terrain validé** : c'est un pré-diagnostic à valider par un écologue. Toujours le mentionner.
- **DD (Données insuffisantes)** = enjeu faible par défaut, mais à signaler comme « à creuser ».
- **Limites MCP** : max 50 km de rayon, max 10 cercles par appel `inventory_multi`. L'outil `priority_species_for_location` consomme un appel LLM (coût OpenAI).

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

- `references/mcp-setup.md` — connecter le serveur MCP (Claude Desktop, Cursor, ChatGPT, test cURL)
- `references/mcp-tools.md` — référence détaillée des 7 outils MCP avec schémas et exemples
- `references/eie-context.md` — rappels méthodologiques EIE (aires d'étude, presets, SINP)
