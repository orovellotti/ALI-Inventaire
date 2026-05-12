# Inventaire Flash — Référence des outils MCP

Serveur : `https://VOTRE-DOMAINE.replit.app/mcp` (Streamable HTTP, stateless, sans authentification).
Nom du serveur : `inventaire-flash` v1.0.0.

Tous les outils renvoient leurs résultats sous forme de bloc texte contenant du JSON formaté.

---

## `geocode`

**Convertit un nom de lieu en coordonnées GPS via OpenStreetMap (Nominatim).**

Entrée :
```json
{ "q": "Saint-Chamas" }
```

Sortie :
```json
{
  "lat": 43.5497879,
  "lng": 5.0341639,
  "displayName": "Saint-Chamas, Istres, Bouches-du-Rhône, ..."
}
```

---

## `inventory_simple`

**Inventaire GBIF autour d'un point GPS, dans un rayon donné.**

Entrée :
```json
{ "lat": 43.5497, "lng": 5.0341, "radius": 2000 }
```
- `radius` : mètres (défaut 500, max 50 000).

Sortie :
```json
{
  "totalSpecies": 114,
  "totalOccurrences": 327,
  "sensitiveCount": 8,
  "confidence": {
    "total": 78,
    "interpretation": "good",
    "message": "Bonne couverture de données",
    "geo": 80, "tax": 90, "time": 70, "trace": 75, "issues": 95, "dup": 60,
    "rawCount": 350, "filteredCount": 327, "dedupCount": 327
  },
  "species": [
    {
      "scientificName": "Falco peregrinus Tunstall, 1771",
      "vernacularName": "Faucon pèlerin",
      "iucnStatus": "LC",
      "alertLevel": "low",
      "kingdom": "Animalia",
      "class": "Aves",
      "taxonKey": 5229490,
      "occurrenceCount": 12
    }
  ],
  "truncated": false
}
```

Les espèces sont dédupliquées (par `scientificName`) et triées par fréquence d'observation. Limité à 200 espèces max ; `truncated: true` si dépassé.

---

## `inventory_multi`

**Inventaire EIE sur plusieurs aires concentriques.**

Entrée :
```json
{
  "circles": [
    {"id": "immediate", "label": "Aire immédiate", "center": [43.55, 5.03], "radius": 500, "enabled": true},
    {"id": "rapprochee", "label": "Aire rapprochée", "center": [43.55, 5.03], "radius": 2000, "enabled": true},
    {"id": "eloignee", "label": "Aire éloignée", "center": [43.55, 5.03], "radius": 6000, "enabled": true}
  ]
}
```
- 1 à 10 cercles. Rayon max : 50 000 m. `enabled` désactive un cercle sans le retirer.

Sortie : même schéma que `inventory_simple` (les espèces des cercles activés sont fusionnées et dédupliquées, le score de confiance est moyenné).

---

## `species_details`

**Fiche d'une espèce GBIF.**

Entrée :
```json
{ "taxonKey": 5229490 }
```

Sortie :
```json
{
  "taxonKey": 5229490,
  "scientificName": "Falco peregrinus",
  "vernacularName": "Faucon pèlerin",
  "iucnStatus": "LC",
  "imageUrl": "https://...",
  "kingdom": "Animalia",
  "class": "Aves"
}
```

---

## `sinp_links`

**Plateformes SINP (Système d'Information Nature et Paysages) couvrant les coordonnées.**

Entrée :
```json
{ "lat": 43.55, "lng": 5.03 }
```

Sortie :
```json
{
  "platforms": [
    {
      "region": "Provence-Alpes-Côte d'Azur",
      "code": "PACA",
      "links": [
        { "label": "Silene Nature", "url": "https://flore.silene.eu/" },
        { "label": "Faune-PACA", "url": "https://www.faune-paca.org/" }
      ]
    }
  ]
}
```

---

## `priority_species_for_location`

**Inventaire GBIF + analyse IA des espèces à enjeux + suggestions d'espèces patrimoniales attendues.**

Entrée :
```json
{
  "toponym": "Saint-Chamas",
  "lat": 43.55,
  "lng": 5.03,
  "radius": 2000
}
```

Sortie :
```json
{
  "inventory": { "totalOccurrences": 327, "speciesCount": 114, "sensitiveCount": 8 },
  "analysis": {
    "toponym": "Saint-Chamas",
    "summary": "Site méditerranéen avec étang de Berre à proximité, enjeux avifaune et flore halophile…",
    "priorityGroups": [
      {
        "group": "Oiseaux", "icon": "🦅",
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
}
```

Coût : un appel LLM (OpenAI gpt-5). Échec si aucune occurrence dans le rayon.

---

## `list_reference_data`

**Référentiels embarqués utiles pour construire un appel à `inventory_multi`.**

Entrée :
```json
{ "kind": "presets" }
```
`kind` ∈ `"presets"` | `"study_areas"` | `"taxon_groups"` | `"sinp_all"`.

Sortie (exemple `presets`) :
```json
{
  "presets": [
    {
      "id": "eolien", "label": "Éolien", "icon": "🌬️", "description": "...",
      "zones": {
        "immediate":  { "radius": 500,   "enabled": true },
        "rapprochee": { "radius": 6000,  "enabled": true },
        "eloignee":   { "radius": 20000, "enabled": false }
      }
    }
  ]
}
```
