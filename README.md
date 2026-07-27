# 🌿 Inventaire Flash

**Outil web de pré-diagnostic écologique rapide** pour les bureaux d'études environnement, écologues, chargés de mission biodiversité et collectivités.

En quelques clics, Inventaire Flash fournit un premier aperçu des espèces connues sur un secteur à partir de données publiques (GBIF, iNaturalist, UICN, référentiel français TAXREF via ALI Species, zonages IGN Géoplateforme). Il **ne remplace pas** un inventaire terrain : c'est une indication amont pour cadrer un projet, préparer une visite de site ou identifier les enjeux potentiels.

> 🔗 **Application en ligne** : https://ali-inventaire.replit.app/

---

## ✨ Fonctionnalités

- **Carte interactive plein écran** (Leaflet + fonds IGN Géoplateforme / OSM) avec recherche d'adresse, clic direct ou import de shapefile.
- **Aires concentriques EIE** (immédiate / rapprochée / éloignée) avec presets prêts à l'emploi (éolien, PV sol, urbanisation, infrastructure, carrière/ICPE).
- **Tableau de bord à 5 onglets** : Synthèse, Enjeux, Espèces, Zonages, Agent IA.
- **Scoring d'enjeux territorial multi-échelle** (régional → national → européen → mondial) avec 6 niveaux : critique, fort, modéré, à confirmer, faible, EEE.
- **Indice de confiance** des données (6 critères) et **jauge de potentiel d'enjeux**.
- **Zonages environnementaux** (ZNIEFF, Natura 2000, réserves, parcs, Ramsar…) recoupant l'aire d'étude, et **espèces désignantes Natura 2000** attendues.
- **Assistant IA** : synthèse rédigée et analyse des espèces à enjeux (GPT-4o-mini via le proxy AI de Replit).
- **Serveur MCP** : brancher Claude, ChatGPT, Cursor… directement sur les outils de l'application.
- **Exports** : rapport texte copiable, CSV/Excel (3 feuilles), capture image de la carte, URL reproductible, liens SINP régionaux.

---

## 🛠️ Stack technique

| Couche | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS v4, shadcn/ui (Radix), Leaflet, Framer Motion |
| Backend | Node.js, Express, TypeScript (ESM) |
| IA | AI Integrations (proxy OpenAI Replit), Model Context Protocol SDK |
| Données | GBIF, iNaturalist, UICN, TAXREF/ALI Species, IGN Géoplateforme WFS, Nominatim, PostgreSQL (Natura 2000) |

---

## 🚀 Démarrage

### Prérequis
- Node.js 20+
- PostgreSQL (pour les données Natura 2000)

### Installation

```bash
npm install
npm run dev
```

L'application démarre sur le port `5000` (frontend + API servis par le même serveur Express).

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Clé du proxy AI Replit (reformulation & espèces à enjeux) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | URL de base du proxy AI |
| `SESSION_SECRET` | Secret de session |
| `DATABASE_URL` | Connexion PostgreSQL (Natura 2000) |

---

## 📡 API

Toutes les données externes (GBIF, etc.) transitent par le backend.

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/inventory` | Inventaire multi-aires (`circles[]`) |
| `GET` | `/api/inventory/simple?lat=&lng=&radius=` | Inventaire d'un point |
| `GET` | `/api/species/:taxonKey` | Détails d'une espèce |
| `GET` | `/api/geocode?q=` | Géocodage (Nominatim) |
| `GET` | `/api/sinp?lat=&lng=` | Liens SINP régionaux |
| `GET` | `/api/zonages?lat=&lng=&radius=` | Zonages environnementaux |
| `GET` | `/api/natura2000/expected?lat=&lng=&radius=` | Espèces désignantes Natura 2000 |
| `POST` | `/api/llm/priority-species` | Analyse IA des espèces à enjeux |
| `ALL` | `/mcp` | Serveur MCP (Streamable HTTP, stateless) |

---

## 🤖 Connexion Agent IA (MCP)

Le serveur MCP expose les outils de l'application à tout client compatible (Claude Desktop, ChatGPT, Cursor, Claude.ai).

**Endpoint de production :** `https://ali-inventaire.replit.app/mcp`

Exemple de configuration Claude Desktop :

```json
{
  "mcpServers": {
    "inventaire-flash": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://ali-inventaire.replit.app/mcp"]
    }
  }
}
```

**Outils exposés :** `inventory_simple`, `inventory_multi`, `species_details`, `geocode`, `sinp_links`, `zonages_for_location`, `priority_species_for_location`, `list_reference_data`.

---

## 📁 Structure du projet

```
client/          Frontend React (composants, pages, hooks, lib)
server/          Backend Express
  gbif.ts        Proxy et enrichissement GBIF/iNaturalist
  ali.ts         Statuts territoriaux TAXREF/ALI Species
  scoring.ts     Moteur de scoring d'enjeux territorial
  mcp.ts         Serveur MCP
  routes.ts      Enregistrement des endpoints
  services/      Géoservices IGN, Natura 2000…
shared/          Types partagés client/serveur
UX.md            Description détaillée de l'expérience utilisateur
replit.md        Architecture technique et notes de projet
```

---

## ⚠️ Limites

Inventaire Flash est un outil d'**indication amont**, pas de vérité de terrain. Les résultats dépendent de la couverture des bases de données publiques (souvent partielle et hétérogène). Un indice de confiance accompagne chaque analyse. **Un inventaire flash ne remplace jamais un inventaire écologique de terrain réalisé par un expert.**

---

## 📄 Licence

Projet privé. Tous droits réservés.
