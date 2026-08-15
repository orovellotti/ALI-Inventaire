# Inventaire Flash — Description fonctionnelle et UX complète

> Document de référence décrivant le fonctionnement de l'application et l'expérience utilisateur, à jour de la refonte du tableau de bord (3 onglets, mode Essentiel/Expert, assistant IA contextuel).

---

## 1. Objet de l'application

**Inventaire Flash** est un outil web de **pré-diagnostic écologique rapide** destiné aux bureaux d'études environnement, écologues, chargés de mission biodiversité et collectivités. En quelques clics, il fournit un premier aperçu des espèces connues sur un secteur et de son contexte réglementaire, à partir de données publiques :

- **GBIF** (occurrences d'espèces mondiales) — source principale
- **iNaturalist** (observations naturalistes, optionnel)
- **UICN** (statuts de conservation)
- **IGN Géoplateforme / PatriNat** (zonages environnementaux officiels)
- **EEA / INPN** (espèces et habitats désignant les sites Natura 2000)
- **ALI Species / TAXREF** (statuts réglementaires français officiels)
- **SINP** (plateformes régionales de données naturalistes)

L'outil **ne remplace pas un inventaire terrain** : c'est une indication amont pour cadrer un projet, préparer une visite de site ou identifier les enjeux potentiels avant de mobiliser des moyens lourds. Un indice de confiance et des avertissements systématiques rappellent cette limite.

**Accès** : 100 % web, sans inscription ni compte. URL de production : `https://ali-inventaire.replit.app/`.

---

## 2. Principes de design

- **Carte plein écran** : la carte interactive domine l'écran ; les outils sont des panneaux flottants en verre dépoli (glass morphism).
- **Français, ton neutre** : terminologie écologue (UICN, ZNIEFF, EIE, SINP), sans jargon informatique.
- **Deux niveaux de lecture** : mode **Essentiel** (par défaut, lecture décisionnelle simple) et mode **Expert** (indicateurs techniques, identifiants, filtres avancés).
- **Tout est partageable** : chaque analyse génère une URL reproductible (`?lat=…&lng=…&radius=…`) et une note écologique copiable.
- **Indication, pas vérité** : indice de confiance, mentions « à valider par un écologue », niveaux d'enjeu présentés comme des potentiels.

---

## 3. Parcours utilisateur principal

### Étape 1 — Arrivée
Carte centrée sur la France métropolitaine (fond IGN Plan v2). Éléments en surimpression :
- **Haut gauche** : logo « Inventaire Flash », bouton **« ? »** (méthodologie), bouton **« Agent IA »** (connexion MCP).
- **Haut centre** : panneau de recherche « Lieu, commune, adresse… » + bouton **« ⚡ Lancer l'inventaire flash »**.
- **Haut droite** : bouton **« Affichage de la carte »** (fonds + couches écologiques).

### Étape 2 — Choisir un secteur
Trois façons de définir le centre d'analyse :
1. **Recherche textuelle** (Nominatim) avec suggestions live.
2. **Clic direct sur la carte** — marqueur teal + géocodage inverse (commune, département, région).
3. **Import shapefile (.zip)** — le polygone réel du projet s'affiche ; son centroïde devient le centre d'analyse.

### Étape 3 — Configurer le périmètre
Sous-panneau « Paramètres de l'étude » :
- **Presets EIE** : Éolien, PV sol (petit/moyen/grand), Urbanisation, Infrastructure linéaire, Carrière/ICPE — chacun configure automatiquement trois aires concentriques conformes aux standards d'étude d'impact.
- **Trois aires concentriques personnalisables** :
  - 🟢 **Aire immédiate** (500 m par défaut, teal, trait plein) — zone du projet stricto sensu
  - 🔵 **Aire rapprochée** (2 km, bleu, pointillés) — zone d'influence directe
  - 🟣 **Aire éloignée** (6 km, indigo, pointillés) — contexte écologique large
- Chaque aire est activable/désactivable, son rayon ajustable ; toute modification manuelle bascule en mode « Personnalisé ».

### Étape 4 — Lancer l'inventaire
Traitement de ~2 à 8 s : requêtes GBIF et iNaturalist parallélisées côté serveur, fusion, dédoublonnage (consolidation par taxon valide TAXREF), enrichissement UICN. Le bouton affiche un état de chargement.

### Étape 5 — Lire les résultats : le tableau de bord

Le **panneau de résultats** glisse depuis la droite (desktop, redimensionnable 360-800 px) ou depuis le bas (mobile, bottom sheet 80 %). La carte se décale pour garder le point d'analyse visible. Objectif : comprendre le niveau d'enjeu d'un secteur **en moins de 30 secondes**.

#### En-tête compact
- Titre + sous-titre « Diagnostic biodiversité d'un site »
- Nom du lieu analysé
- Bouton **« Changer le site »** (retour à la carte)
- Bascule **Essentiel / Expert** (persistée en localStorage, sans rechargement)

#### Barre d'onglets (3 onglets, accessible)
Rôles ARIA tablist/tab/tabpanel, navigation clavier (flèches, Home/End), badges numériques, plus le bouton **« ✨ Assistant »**.

#### Onglet 1 — Vue d'ensemble (entrée et cœur décisionnel)
- **Carte « Niveau d'enjeu du site »** : Faible / Modéré / Fort (dérivé du potentiel d'enjeux) avec 3 compteurs : protections réglementaires, espèces sensibles, zonages identifiés. Mention « estimation indicative à valider par un écologue ».
- **« À retenir »** : max 3 informations prioritaires dérivées des données réelles (protection réglementaire, espèces sensibles, statuts à vérifier, recommandation terrain).
- **« Actions recommandées »** : raccourcis vers les espèces prioritaires, les contraintes réglementaires, l'assistant IA.
- **Mode Expert uniquement** : 4 compteurs (taxons valides / noms bruts, sensibles, zonages, sources GBIF±iNat), jauge **Potentiel d'enjeux** 0-100 avec facteurs contributifs, **Indice de confiance** 0-100 (6 critères : géolocalisation, fiabilité taxonomique, fraîcheur, traçabilité, qualité de source, dédoublonnage), synthèse automatique textuelle.
- **Points de vigilance** : espèces classées par **niveau d'enjeu territorial** (moteur de scoring multi-échelle régional → national → européen → mondial, précédence stricte), en 6 sections repliables :
  - 🔴 Critique · 🟠 Fort · 🟡 Modéré · ⚪ À confirmer · 🟢 Faible · 🟤 EEE (espèces exotiques envahissantes — enjeu de gestion, jamais de conservation)
- Chaque **carte d'espèce** affiche : photo, noms vernaculaire + scientifique, statuts territoriaux ALI/TAXREF, statut UICN, avertissements de cohérence, action recommandée, métadonnées d'observation (distance du centre, année de dernière observation, nombre d'occurrences, source) et liens ALI Species, Wikipédia, GBIF, iNaturalist.

#### Onglet 2 — Espèces (exploration exhaustive)
- **Ligne de synthèse** : total, sensibles, à vérifier.
- **Filtres** : Toutes, Sensibles, Protégées, À vérifier, Observations récentes (+ Menacées, Patrimoniales, Marine, Terrestre en mode Expert).
- **Recherche** par nom.
- **Groupes taxonomiques repliables** (Oiseaux, Mammifères, Reptiles, Amphibiens, Poissons, Insectes, Arachnides, Mollusques, Plantes, Champignons, Autres) avec compteurs et **période propice d'inventaire**.
- **Liste compacte** : une ligne par espèce avec badge de niveau d'enjeu, statut, dernière observation, source.

#### Onglet 3 — Zonages (contexte réglementaire)
- Phrase de synthèse (nombre de zonages, rayon).
- **Liste compacte hiérarchisée** : réglementaire > Natura 2000 > ZNIEFF > information. Les **3 plus importants** d'abord, bouton « Voir les N autres zonages ». Chaque ligne se déplie : type, catégorie, lien fiche officielle INPN, **espèces justifiant le classement** (sites Natura 2000), identifiants techniques en mode Expert.
- **Espèces Natura 2000 attendues** : espèces désignatrices des sites proches (base locale France ~37 000 lignes), marquées **attendue** ou **observée** selon croisement avec l'inventaire.
- **Lien SINP régional** (auto-détection de la région, 14 régions dont DOM-TOM).

Zonages couverts (17 couches IGN/PatriNat) : ZNIEFF I/II (+ mer), Natura 2000 (SIC/ZSC, ZPS), Parcs nationaux, PNR, Réserves naturelles (RNN/RNR), Réserves biologiques, APB/APHN, Parcs marins, Ramsar, Réserves de biosphère, Conservatoire du littoral.

#### Assistant IA contextuel
Bouton **« ✨ Assistant »** dans la barre d'onglets (et action recommandée en Vue d'ensemble) : panneau plein écran avec suggestions de questions propres à la vue courante et l'**analyse IA « Espèces à enjeux »** — top 5 espèces les plus marquantes, avec niveau (majeur/fort/modéré) et justification factuelle citant les référentiels officiels (UICN France, Arrêté du 29/10/2009, Directives Oiseaux/Habitats, ZNIEFF déterminantes). L'analyse intègre :
- les sites **Natura 2000 à proximité** (5 km) et leurs espèces désignatrices,
- la **compatibilité d'habitat** (recouvrement emprise/site + distance écologique par groupe taxonomique) qui promeut des espèces « très probables localement »,
- les **statuts officiels ALI/TAXREF** en badges colorés.
Classement des preuves : observée (A) > très probable localement (C) > avérée à l'échelle du site (B) > autres (D, E). Fermeture par Échap ou bouton dédié.

#### Pied de panneau — actions transverses
- **« Générer la note écologique »** (bouton principal) : dialogue avec le rapport texte structuré, copiable. Options : **Reformuler** (IA — note de synthèse 250-400 mots structurée, sans hallucination de référentiels), **Partager** (Web Share API), **Email** (mailto pré-rempli).
- **Export CSV** (compatible Excel FR) et **Excel** (.xlsx, 3 feuilles : Espèces, Métadonnées, Synthèse par groupe) — respectent les filtres actifs.
- **Export image** (capture .jpg de la carte).

### Étape 6 — Interaction carte ↔ liste
- **Marqueurs colorés** (rouge/orange/vert selon le niveau d'enjeu) pour chaque observation.
- **Survol** : info-bulle nom + statut UICN. **Clic marqueur** : sélection de l'espèce, anneau teal, ouverture du panneau sur l'onglet pertinent.
- **Clic sur une espèce** dans le panneau : mise en évidence de ses observations sur la carte.

### Étape 7 — Affichage de la carte
Bouton **« Affichage de la carte »** : choix du fond (IGN Plan v2, IGN Photos, Cartes IGN, OSM clair, OSM topo) et couches écologiques WMS optionnelles (parcs, réserves, Natura 2000 Habitats/Oiseaux, ZNIEFF I/II, zones humides). État persisté en localStorage.

### Étape 8 — Partage et reproduction
- **URL reproductible** (lat/lng/rayon) copiée dans le rapport — un collègue rouvre exactement la même analyse.
- **Liens SINP régionaux** pour approfondir avec les données locales.

---

## 4. Agent IA externe (serveur MCP)

L'application est aussi un **serveur MCP** (Model Context Protocol, Streamable HTTP, sans état) permettant à un assistant IA (Claude Desktop, ChatGPT, Claude.ai, Cursor…) d'interroger l'inventaire en langage naturel.

- **Endpoint** : `/mcp` — en production `https://ali-inventaire.replit.app/mcp`
- **Outils exposés** : `inventory_simple`, `inventory_multi`, `species_details`, `geocode`, `sinp_links`, `zonages_for_location`, `priority_species_for_location`, `list_reference_data`
- Le dialogue « Agent IA » de l'application fournit la marche à suivre et un prompt système prêt à coller.

---

## 5. API publique (REST)

| Méthode | Chemin | Description |
|---|---|---|
| `POST` | `/api/inventory` | Inventaire multi-cercles (`circles[]`) |
| `GET` | `/api/inventory/simple?lat=&lng=&radius=` | Inventaire simple |
| `GET` | `/api/species/:taxonKey` | Détails espèce (photo, UICN, nom vernaculaire) |
| `GET` | `/api/geocode?q=` | Géocodage (Nominatim) |
| `GET` | `/api/zonages?lat=&lng=&radius=` | Zonages environnementaux groupés par catégorie |
| `GET` | `/api/natura2000/expected?lat=&lng=&radius=` | Espèces désignatrices Natura 2000 attendues |
| `POST` | `/api/llm/priority-species` | Analyse IA des espèces à enjeux |
| `GET` | `/api/sinp?lat=&lng=` · `/api/sinp/all` | Liens SINP régionaux |
| `GET` | `/api/presets` · `/api/study-areas` · `/api/taxon-groups` | Référentiels EIE |
| `GET` | `/api/health` | Santé + documentation |

---

## 6. Règles métier clés

- **Consolidation taxonomique** : les noms bruts GBIF/iNat sont rapprochés des taxons valides TAXREF (cdRef) ; les compteurs distinguent taxons valides et noms bruts.
- **Niveau d'enjeu territorial** : précédence stricte régional → national → européen → mondial ; les statuts UICN sont toujours rattachés à un territoire.
- **EEE** : une espèce exotique envahissante n'est **jamais** un enjeu de conservation — badge « enjeu de gestion », score plafonné, exclue des enjeux forts.
- **Données marines** : filtrables pour ne pas fausser un diagnostic terrestre.
- **Niveau d'enjeu global du site** : dérivé du potentiel d'enjeux (règle simple, présentée comme indicative).
- **Score d'enjeu IA** : statut 30 % · importance du site 25 % · occurrence 20 % · habitat 15 % · qualité de la donnée 10 %.

---

## 7. États et feedbacks

| Situation | Feedback |
|---|---|
| Recherche en cours | Spinner + suggestions live |
| Inventaire en cours | Bouton désactivé « Analyse en cours… » |
| Aucun résultat | « Aucune espèce trouvée — essayer un rayon plus grand » |
| Zonages en chargement | Loader dans la carte de niveau d'enjeu et l'onglet Zonages |
| Aucun zonage | Message + suggestion d'élargir le rayon |
| Erreur API | Toast d'erreur, suggestion de réessayer |
| Confiance faible | Avertissement + recommandation d'inventaire terrain |
| Espèce sélectionnée | Anneau teal carte + surbrillance liste |
| Export / IA en cours | Bouton désactivé avec loader |
| Nouvelle analyse | Retour automatique à la Vue d'ensemble, états réinitialisés |

---

## 8. Accessibilité et responsive

- **Onglets** : rôles ARIA complets, navigation flèches/Home/End.
- **Sections dépliables** : `aria-expanded` ; **assistant** : dialogue modal, focus à l'ouverture, fermeture Échap.
- **Mobile** : bottom sheet (80 % de hauteur, coins arrondis) ; **desktop** : panneau latéral redimensionnable (poignée, double-clic = 600 px). Barres d'onglets et de filtres scrollables horizontalement. Web Share natif quand disponible.

---

## 9. Charte visuelle

- **Primaire** : teal `#0d9488` (point d'analyse, sélection, accents).
- **Alerte** : rouge `#dc2626` (fort), orange `#f59e0b` (modéré), vert `#22c55e` (faible).
- **Typo** : sans-serif système, titres semi-bold.
- **Composants** : shadcn/ui (Radix), transitions Framer Motion 300-400 ms, icônes Lucide.

---

## 10. Limites connues et assumées

- Le pré-diagnostic repose sur des **données publiques opportunistes** : absence de donnée ≠ absence d'espèce.
- Les zonages sur la carte sont des **tuiles raster WMS** : la sélection d'un zonage précis depuis la liste vers la carte n'est pas encore disponible dans cette version (évolution en cours).
- L'assistant IA réutilise l'analyse « espèces à enjeux » ; il n'y a pas encore de question libre.
- Le niveau d'enjeu global est une **estimation simple** à valider par un écologue.

---

## 11. Ce que l'utilisateur n'a pas à faire

- Comprendre l'API GBIF ou les codes UICN (libellés en français).
- Installer quoi que ce soit, créer un compte, gérer des clés.
- Gérer des projections cartographiques (tout est en WGS84).
