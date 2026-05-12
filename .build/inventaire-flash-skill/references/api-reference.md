# Inventaire Flash — Référence API REST

Base URL : `https://VOTRE-DOMAINE.replit.app` (remplacer par l'URL réelle déployée).

Toutes les réponses sont en JSON. Pas d'authentification.

---

## `GET /api/geocode?q=...`

Géocodage Nominatim (OpenStreetMap).

**Exemple :**
```
GET /api/geocode?q=Saint-Chamas
```
**Réponse :**
```json
{ "lat": 43.5497879, "lon": 5.0341639, "display_name": "Saint-Chamas, ..." }
```

---

## `GET /api/inventory/simple?lat=&lng=&radius=`

Inventaire d'un point. `radius` en mètres (défaut 500, max 50 000).

**Exemple :**
```
GET /api/inventory/simple?lat=43.5497&lng=5.0341&radius=2000
```
**Réponse :**
```json
{
  "occurrences": [
    {
      "key": 1234,
      "scientificName": "Falco peregrinus Tunstall, 1771",
      "vernacularName": "Faucon pèlerin",
      "decimalLatitude": 43.55,
      "decimalLongitude": 5.03,
      "iucnStatus": "LC",
      "alertLevel": "low",
      "kingdom": "Animalia",
      "class": "Aves",
      "taxonKey": 5229490
    }
  ],
  "stats": { "total": 327, "speciesCount": 114, "sensitiveCount": 8 },
  "center": [43.5497, 5.0341],
  "radius": 2000,
  "confidence": {
    "total": 78,
    "interpretation": "good",
    "message": "Bonne couverture de données",
    "geo": 80, "tax": 90, "time": 70, "trace": 75, "issues": 95, "dup": 60,
    "rawCount": 350, "filteredCount": 327, "dedupCount": 327
  }
}
```

---

## `POST /api/inventory`

Inventaire multi-aires (standard EIE). Corps JSON :

```json
{
  "circles": [
    {"id":"immediate","center":[43.55,5.03],"radius":500,"enabled":true,"label":"Aire immédiate"},
    {"id":"rapprochee","center":[43.55,5.03],"radius":2000,"enabled":true,"label":"Aire rapprochée"},
    {"id":"eloignee","center":[43.55,5.03],"radius":6000,"enabled":true,"label":"Aire éloignée"}
  ]
}
```

Limites : 1-10 cercles, rayon max 50 km. Même format de réponse que `/api/inventory/simple`.

---

## `GET /api/species/:taxonKey`

Détails d'une espèce GBIF.
```
GET /api/species/5229490
→ { "taxonKey": 5229490, "imageUrl": "...", "iucnStatus": "LC", "vernacularName": "Faucon pèlerin" }
```

---

## `GET /api/sinp?lat=&lng=`

Plateformes SINP (Système d'Information Nature et Paysages) couvrant les coordonnées.
```
GET /api/sinp?lat=43.55&lng=5.03
→ { "platforms": [ { "region": "Provence-Alpes-Côte d'Azur", "code": "PACA", "links": [{"label":"Silene Nature","url":"..."}] } ] }
```

## `GET /api/sinp/all`

Toutes les plateformes SINP françaises (14 régions + outre-mer).

---

## `GET /api/presets`

Presets de projets EIE (rayons d'aires d'étude pré-configurés) :

```json
{ "presets": [
  { "id": "eolien", "label": "Éolien", "icon": "🌬️", "description": "...",
    "zones": {
      "immediate": {"radius": 500, "enabled": true},
      "rapprochee": {"radius": 6000, "enabled": true},
      "eloignee": {"radius": 20000, "enabled": false}
    }},
  ...
]}
```

## `GET /api/study-areas`

Définitions des trois aires d'étude EIE standard (immédiate, rapprochée, éloignée).

## `GET /api/taxon-groups`

Groupes taxonomiques disponibles (Oiseaux, Mammifères, Reptiles, etc.).

---

## `POST /api/llm/priority-species`

Analyse IA des espèces à enjeux (UICN, espèces protégées France, ZNIEFF, directives Habitats/Oiseaux) + suggestions d'espèces patrimoniales attendues.

**Corps :**
```json
{
  "toponym": "Saint-Chamas",
  "coords": [43.55, 5.03],
  "occurrences": [ /* tableau d'occurrences (issu de /api/inventory/simple) */ ]
}
```

**Réponse :**
```json
{
  "toponym": "Saint-Chamas",
  "summary": "Site méditerranéen avec étang de Berre à proximité, enjeux avifaune et flore halophile…",
  "priorityGroups": [
    { "group": "Oiseaux", "icon": "🦅",
      "species": [
        { "scientificName": "Aquila fasciata", "vernacularName": "Aigle de Bonelli",
          "reason": "EN UICN France, espèce protégée, PNA",
          "level": "majeur" }
      ]
    }
  ],
  "expectedSpecies": [
    { "scientificName": "Tadorna ferruginea", "vernacularName": "Tadorne casarca",
      "group": "Oiseaux", "icon": "🦆",
      "reason": "Habitat favorable (étang de Berre), espèce rare en migration",
      "level": "modéré", "seenInGbif": false }
  ],
  "recommendations": [
    "Inventaire avifaune nicheuse en avril-juin",
    "Prospection flore halophile en mai (sansouires)"
  ],
  "generatedAt": "2025-05-12T15:00:00.000Z"
}
```

Limites : max 5 000 occurrences en entrée. Coût : un appel LLM (OpenAI gpt-5).

---

## `GET /api/health`

Statut du service + liste auto-documentée des endpoints.

---

## `GET /api/lieux-dits?q=...`

Recherche de lieux-dits / communes françaises avec leur polygone (pour utiliser un contour OSM comme emprise de projet).

## `GET /api/data-sources`

Catalogue d'autres sources de données biodiversité (DataCatalog).
