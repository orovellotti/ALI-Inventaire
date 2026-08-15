# Inventaire Flash — Description de l'expérience utilisateur

## 1. Objectif et utilisateur cible

**Inventaire Flash** est un outil web de **pré-diagnostic écologique rapide** destiné aux bureaux d'études environnement, écologues, chargés de mission biodiversité, et collectivités. Il permet en quelques clics d'obtenir un premier aperçu des espèces connues sur un secteur, à partir des données publiques (GBIF + iNaturalist + UICN).

L'outil **ne remplace pas** un inventaire terrain : c'est une **indication amont** pour cadrer un projet, préparer une visite de site, ou identifier les enjeux potentiels avant de mobiliser des moyens lourds.

---

## 2. Principes de design

- **Carte plein écran** : l'écran est dominé par la carte interactive ; les outils sont des panneaux flottants en verre dépoli (glass morphism) qui n'occupent que ce qui est utile.
- **Français, ton neutre** : terminologie écologue (UICN, ZNIEFF, EIE, SINP) sans jargon technique informatique.
- **Pas d'inscription** : aucune création de compte, pas de login. Tout est utilisable immédiatement.
- **Tout est partageable** : chaque analyse génère une URL reproductible (`?lat=…&lng=…&radius=…`) et un rapport texte copiable.
- **Indication, pas vérité** : un indice de confiance accompagne chaque résultat ; les avertissements « ne remplace pas un inventaire terrain » sont systématiques.

---

## 3. Parcours principal

### Étape 1 — Arrivée sur l'application
L'utilisateur arrive sur la carte centrée par défaut (France métropolitaine, fond IGN Plan). Trois éléments en surimpression :
- **En haut à gauche** : logo « Inventaire Flash » + bouton **« ?» (Aide)** + bouton **« Agent IA »** (intégration MCP).
- **En haut au centre** : panneau de recherche flottant avec champ « Lieu, commune, adresse… » et bouton **« Lancer l'inventaire flash »**.
- **En haut à droite** : sélecteur de **couches** (fond de carte + couches écologiques optionnelles).

### Étape 2 — Choisir un secteur
Trois façons de définir le centre d'analyse :
1. **Recherche textuelle** (Nominatim) — l'utilisateur tape un nom de lieu, sélectionne dans la liste déroulante des suggestions, la carte zoome.
2. **Clic direct** sur la carte — un marqueur teal apparaît à l'endroit cliqué ; le nom du lieu (commune, département, région) est récupéré par géocodage inverse.
3. **Import shapefile** (.zip) — l'utilisateur charge le polygone réel de son projet ; il s'affiche sur la carte et son centroïde devient le centre d'analyse.

### Étape 3 — Configurer le périmètre
Un sous-panneau « Paramètres de l'étude » se déplie :
- **Presets EIE prêts à l'emploi** : Éolien, PV sol (petit/moyen/grand), Urbanisation, Infrastructure linéaire, Carrière/ICPE. Chaque preset configure automatiquement trois aires concentriques selon les standards d'étude d'impact.
- **Trois aires concentriques personnalisables** :
  - 🟢 **Aire immédiate** (par défaut 500 m, teal, trait plein) — zone du projet stricto sensu
  - 🔵 **Aire rapprochée** (2 km, bleu, pointillés) — zone d'influence directe
  - 🟣 **Aire éloignée** (6 km, indigo, pointillés) — contexte écologique large
- Chaque aire peut être **activée/désactivée** indépendamment et son rayon ajusté.
- Toute modification manuelle bascule le preset en mode « Personnalisé ».

### Étape 4 — Lancer l'inventaire
L'utilisateur clique sur **« ⚡ Lancer l'inventaire flash »**. Pendant le traitement (~2 à 8 s) :
- Le bouton affiche un état chargement.
- Les requêtes vers GBIF et iNaturalist sont parallélisées côté serveur.
- Les résultats sont fusionnés, dédoublonnés, et enrichis avec les statuts UICN.

### Étape 5 — Lire les résultats (tableau de bord à onglets)
Le **panneau de résultats** glisse depuis la droite. La carte se décale automatiquement vers la gauche pour que le point d'analyse reste visible à côté du panneau. Plutôt qu'une longue liste déroulante, le panneau est un **tableau de bord d'aide à la décision organisé en 3 onglets** (Vue d'ensemble, Espèces, Zonages) navigables via une barre d'onglets accessible (rôles ARIA tablist, navigation flèches/Home/End) avec badges numériques. L'objectif : permettre à un écologue de comprendre le niveau d'enjeu d'un secteur en moins de 30 secondes.

En-tête compact : titre + sous-titre « Diagnostic biodiversité d'un site », nom du lieu, bouton **« Changer le site »**, bascule **Essentiel / Expert** (persistée en localStorage — le mode Essentiel masque les indicateurs techniques, le mode Expert révèle compteurs, jauges, identifiants et filtres avancés).

**Onglet 1 — Vue d'ensemble** (vue d'entrée et cœur décisionnel)
- **Carte « Niveau d'enjeu du site »** : niveau global Faible / Modéré / Fort (dérivé du potentiel d'enjeux), avec 3 compteurs contextuels : protections réglementaires, espèces sensibles, zonages identifiés.
- **« À retenir »** : au maximum 3 informations prioritaires dérivées des données réelles.
- **« Actions recommandées »** : raccourcis vers les espèces prioritaires, les contraintes réglementaires et l'assistant IA.
- **Mode Expert uniquement** : 4 compteurs (taxons, sensibles, zonages, sources), jauge *Potentiel d'enjeux* 0-100, *Indice de confiance* (6 critères), synthèse automatique.
- **Points de vigilance** : les espèces classées par **niveau d'enjeu territorial** (moteur de scoring multi-échelle : régional → national → européen → mondial, précédence stricte), présentées en **6 sections repliables** (les plus critiques ouvertes par défaut) :
- 🔴 **Critique**
- 🟠 **Fort**
- 🟡 **Modéré**
- ⚪ **À confirmer** (statut incertain, ex. ALI indisponible)
- 🟢 **Faible**
- 🟤 **EEE** (espèces exotiques envahissantes — enjeu de gestion, jamais de conservation)

Chaque carte d'espèce affiche : vignette photo, nom vernaculaire + scientifique, statuts territoriaux ALI/TAXREF (portée + territoire + tonalité), statut UICN, avertissements de cohérence, action recommandée, **métadonnées d'observation** (distance depuis le centre, année de dernière observation, nombre d'occurrences, source) et liens vers ALI Species (référentiel français TAXREF), Wikipédia, GBIF, iNaturalist.

**Onglet 2 — Espèces** (exploration exhaustive)
- **Ligne de synthèse** : total d'espèces, sensibles, à vérifier.
- **Chips de filtre par attribut** : Toutes, Sensibles, Protégées, À vérifier, Observations récentes (+ Menacées, Patrimoniales, Marine, Terrestre en mode Expert).
- **Champ de recherche** par nom.
- **Cartes de groupes taxonomiques** repliables (Oiseaux, Mammifères, Reptiles, Amphibiens, Poissons, Insectes, Arachnides, Mollusques, Plantes, Champignons, Autres) avec compteurs (total / sensibles / protégées) et période propice d'inventaire.
- **Liste compacte** : une ligne par espèce (nom vernaculaire + scientifique une seule fois), badge de niveau d'enjeu, statut, dernière observation, source, icône info pour les statuts non évalués.

**Onglet 3 — Zonages** (contexte réglementaire)
- Phrase de synthèse des zonages recoupés.
- **Liste compacte hiérarchisée** (réglementaire > Natura 2000 > ZNIEFF > info) : les 3 zonages les plus importants affichés d'abord, bouton « Voir les N autres zonages ». Chaque ligne est dépliable : type, catégorie, lien fiche INPN, espèces justifiant le classement (Natura 2000), identifiants techniques en mode Expert.
- Espèces Natura 2000 attendues et lien SINP régional.

**Assistant IA contextuel** (remplace l'ancien onglet Agent IA)
- Bouton **« ✨ Assistant »** dans la barre d'onglets (et action recommandée en Vue d'ensemble) : ouvre un panneau plein écran avec des suggestions de questions propres à la vue courante et l'analyse IA « Espèces à enjeux » (top 5 espèces les plus marquantes avec niveau et justification citant les référentiels officiels). Fermeture par Échap ou bouton dédié.

**Pied de panneau — actions transverses** (accessibles depuis tous les onglets)
- **Note écologique** : ouvre un dialogue avec le rapport texte structuré, copiable ; option **Reformuler** (✨ IA GPT-4o-mini) ; **Partager** (Web Share API) ; **Email** (mailto: pré-rempli).
- **Export CSV / Excel** (3 feuilles : espèces, métadonnées, synthèse par groupe).
- **Export image** (capture .jpg de la carte).

### Étape 6 — Interaction carte ↔ liste
- **Marqueurs colorés** sur la carte (rouge/orange/vert selon le niveau d'enjeu) pour chaque observation.
- **Survol** d'un marqueur : info-bulle avec nom vernaculaire + scientifique + statut UICN.
- **Clic** sur un marqueur : sélectionne l'espèce, met en surbrillance le point (anneau teal), ouvre le panneau si fermé et bascule sur l'onglet pertinent (Enjeux/Espèces) pour révéler la carte d'espèce correspondante.
- **Clic** sur une carte ou une ligne d'espèce dans le panneau : met en évidence ses observations sur la carte.

### Étape 7 — Couches contextuelles (optionnel)
Le bouton **« Affichage de la carte »** en haut à droite ouvre un sélecteur pour :
- **Choisir un fond de carte** : IGN Plan v2, IGN Photos satellite, IGN Cartes IGN, OSM clair, OSM topographique.
- **Afficher des zones nature** (couches WMS Géoplateforme IGN) :
  - Parcs nationaux, parcs naturels régionaux
  - Réserves naturelles
  - Zones Natura 2000 (Habitats, Oiseaux)
  - Zones d'intérêt fort (ZNIEFF type I) et plus large (ZNIEFF type II)
  - Zones humides
- L'état (couches actives, fond choisi) est **persistant en localStorage**.

### Étape 8 — Partage et reproduction
- **URL** : copiée automatiquement dans le rapport, contient lat/lng/rayon, permet à un collègue de rouvrir exactement la même analyse.
- **Lien SINP régional** : auto-détection de la région française, affichage du lien vers la plateforme SINP locale (14 régions couvertes dont DOM-TOM) pour aller plus loin avec les données régionales.

---

## 4. Composants UX transverses

### Barre d'onglets du tableau de bord
Le panneau de résultats est structuré en 3 onglets (Vue d'ensemble, Espèces, Zonages) présentés dans une barre scrollable horizontalement, chacun avec une icône et un badge numérique (ex. nombre d'espèces, nombre de zonages), plus le bouton « ✨ Assistant ». Les « Actions recommandées » de la Vue d'ensemble servent de raccourcis pour guider le parcours de lecture. Le bouton principal en pied de panneau s'intitule « Générer la note écologique ».

### Panneau redimensionnable
La poignée verticale verte sur le bord gauche du panneau de résultats permet de le redimensionner (largeur 360-800 px). Double-clic = reset à 600 px. La carte s'adapte automatiquement au nouveau décalage.

### Dialogue « À propos »
Bouton **« ? »** : ouvre une fenêtre expliquant la méthodologie (sources, calcul de la confiance, signification des aires EIE, classification UICN) — destinée à un écologue, pas à un développeur.

### Dialogue « Agent IA »
Bouton **« Agent IA »** : explique comment connecter Inventaire Flash comme **serveur MCP** à Claude Desktop, ChatGPT (Custom Connector ou Custom GPT), Claude.ai, Cursor. Inclut un prompt système prêt à coller et des exemples de questions naturelles (« Quelles espèces protégées autour de Honfleur ? »).

Le serveur MCP est exposé sur l'endpoint **`/mcp`** (Streamable HTTP, mode stateless). En production, l'URL à fournir aux clients MCP est **`https://ali-inventaire.replit.app/mcp`** (le dialogue la déduit automatiquement de l'URL courante). Outils exposés : `inventory_simple`, `inventory_multi`, `species_details`, `geocode`, `sinp_links`, `zonages_for_location`, `priority_species_for_location`, `list_reference_data`.

### Reformulation IA du rapport
Le bouton **« Reformuler »** envoie le rapport brut à GPT-4o-mini (via le proxy AI Integrations de Replit) qui produit une note de synthèse de 250-400 mots, structurée (contexte, enjeux, espèces clés, recommandations justifiées, limites), respectant strictement les données fournies (pas d'hallucination de référentiels).

### Analyse IA « Espèces à enjeux »
Bouton dédié dans le panneau : identifie les **5 espèces les plus marquantes** pour le secteur, avec niveau (majeur/fort/modéré) et justification factuelle citant les référentiels officiels (UICN France, Arrêté du 29 oct. 2009, Directives Oiseaux/Habitats, ZNIEFF déterminantes).

---

## 5. États et feedbacks

| Situation | Feedback utilisateur |
|---|---|
| Recherche en cours | Spinner dans le champ de recherche, suggestions live |
| Inventaire en cours | Bouton désactivé, libellé « Analyse en cours… » |
| Aucun résultat | Message « Aucune espèce trouvée — essayer un rayon plus grand » |
| Erreur API GBIF/iNat | Toast d'erreur en bas, suggestion de réessayer |
| Confiance faible | Message d'avertissement dans le panneau, suggestion de compléter par inventaire terrain |
| Espèce sélectionnée | Anneau teal sur le marqueur carte + surbrillance de la carte liste |
| Filtre actif | Pastille de compteur sur le bouton « Couches » ou « Filtres » |
| Export en cours | Bouton temporairement désactivé, icône loader |
| IA en cours | Bouton avec icône loader animée, désactivé pendant le call |

---

## 6. Principes mobiles

L'application est **responsive** : sur mobile, le tableau de bord de résultats devient une **feuille inférieure** (bottom sheet, hauteur 80 %, coins arrondis) glissant depuis le bas, avec un bouton de fermeture. Sur desktop il s'agit d'un panneau latéral fixe et redimensionnable. Dans les deux cas la barre d'onglets et les chips de filtres taxon scrollent horizontalement. Les boutons d'export utilisent l'API Web Share native quand disponible.

---

## 7. Charte visuelle

- **Couleur primaire** : teal (#0d9488) — point d'analyse, accents UI, anneau de sélection.
- **Couleurs d'alerte** : rouge (#dc2626) pour enjeux forts, orange (#f59e0b) pour moyens, vert (#22c55e) pour faibles.
- **Typographie** : sans-serif système, hiérarchie claire (titres en semi-bold, corps en regular).
- **Composants** : shadcn/ui sur base Radix, transitions Framer Motion légères (300-400 ms).
- **Iconographie** : Lucide Icons (Leaf, Sparkles, Layers, MapPin, Filter, Download, Mail, Share2, BookOpen).

---

## 8. Ce que l'utilisateur **n'a pas** à faire

- Pas besoin de comprendre l'API GBIF.
- Pas besoin de connaître les codes UICN par cœur (les libellés sont affichés en français).
- Pas besoin d'installer quoi que ce soit (100 % web).
- Pas besoin de gérer des projections cartographiques (tout est en WGS84 sous le capot).
- Pas besoin de créer un compte ou de gérer des secrets.
