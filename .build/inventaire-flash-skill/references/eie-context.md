# Rappels méthodologiques EIE — Études d'impact environnemental France

Contexte utile pour bien interpréter les données d'Inventaire Flash dans un cadre réglementaire EIE.

## Aires d'étude standard (volet écologie)

Trois aires concentriques systématiques :

| Aire | Rayon indicatif | Usage |
|---|---|---|
| **Immédiate** | 200 m – 1 km | Emprise du projet + abords directs : inventaires fins terrain, état initial détaillé |
| **Rapprochée** | 1 – 5 km | Continuités écologiques, fonctionnalités, espèces à grand domaine vital |
| **Éloignée** | 5 – 20 km | Contexte écologique, ZNIEFF, Natura 2000, populations sources |

Les rayons varient selon le type de projet — d'où les **presets** intégrés (`/api/presets`).

## Presets de projets

| Preset | Aires typiques |
|---|---|
| Éolien | immédiate 500 m, rapprochée 6 km, éloignée 20 km (chiroptères, oiseaux migrateurs) |
| PV sol petit (< 5 ha) | immédiate 200 m, rapprochée 500 m, éloignée 2 km |
| PV sol moyen (5-25 ha) | immédiate 500 m, rapprochée 2 km, éloignée 5 km |
| PV sol grand (> 25 ha) | immédiate 500 m, rapprochée 3 km, éloignée 10 km |
| Urbanisation / ZAC | immédiate 200 m, rapprochée 1 km, éloignée 3 km |
| Infrastructure linéaire | immédiate 200 m, rapprochée 1 km, éloignée 5 km |
| Carrière / ICPE | immédiate 300 m, rapprochée 1 km, éloignée 3 km |

## Statuts à connaître pour les espèces à enjeux

- **UICN Liste Rouge** (mondiale, France, régionale) : CR, EN, VU = enjeux forts
- **Espèces protégées France** : arrêtés ministériels par taxon (oiseaux 2009, mammifères 2007, reptiles/amphibiens 2007, insectes 2007, flore 1982…). Toutes nécessitent éventuelle dérogation espèces protégées (article L411-2 CE).
- **ZNIEFF déterminantes** : listes régionales — espèces caractéristiques d'un milieu rare/menacé.
- **Directive Habitats** (annexes II, IV, V) : Natura 2000, sites désignés, dérogations.
- **Directive Oiseaux** (annexe I) : ZPS, espèces d'intérêt communautaire.
- **Plans Nationaux d'Actions (PNA)** : Aigle de Bonelli, Loutre, Lézard ocellé, Pies-grièches…

## Sources de données complémentaires (SINP)

GBIF est mondial mais pas exhaustif en France pour le grain local. **Toujours croiser** avec :

- **SINP régional** (14 plateformes : Silene PACA, Faune-France/LPO, OBHN Hauts-de-France, BiodivAURA, etc.) — listées via `/api/sinp`
- **INPN** (Inventaire National du Patrimoine Naturel — données de référence, ZNIEFF, statuts)
- **TAXREF** (référentiel taxonomique national)
- **Biodiv'AURA, CARMEN, CRPF…** selon la région

L'endpoint `/api/sinp?lat=&lng=` détecte automatiquement la région et propose les liens.

## Limites à toujours rappeler

- Inventaire Flash = **pré-diagnostic** = orientation des prospections terrain
- Ne remplace **jamais** un inventaire de terrain par un écologue qualifié
- La donnée GBIF a un biais d'observateur (plus de données près des villes / réserves)
- Le score de confiance reflète la qualité de la donnée, pas la richesse réelle du site
- Les analyses IA doivent être validées par un écologue avant intégration au dossier
