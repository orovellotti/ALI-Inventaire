# Connecter Inventaire Flash via MCP (Claude Desktop, Cursor, etc.)

Inventaire Flash expose un serveur **MCP (Model Context Protocol)** sur :

```
https://VOTRE-DOMAINE.replit.app/mcp
```

Mode : **Streamable HTTP, stateless** (pas de session).

## Outils MCP disponibles

| Outil | Description |
|---|---|
| `inventory_simple` | Inventaire GBIF autour d'un point (lat, lng, radius) |
| `inventory_multi` | Inventaire EIE multi-aires concentriques |
| `species_details` | Fiche d'une espèce (UICN, vernaculaire, image) |
| `geocode` | Recherche d'un lieu via Nominatim |
| `sinp_links` | Plateformes SINP régionales |
| `priority_species_for_location` | Inventaire + analyse IA des espèces à enjeux |
| `list_reference_data` | Référentiels (presets, aires, groupes taxo, SINP) |

## Configuration Claude Desktop

Claude Desktop ne parle nativement que MCP via stdio. On utilise le pont officiel `mcp-remote` pour l'adapter à HTTP :

Édite `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows) :

```json
{
  "mcpServers": {
    "inventaire-flash": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://VOTRE-DOMAINE.replit.app/mcp"
      ]
    }
  }
}
```

Redémarre Claude Desktop. Les 7 outils apparaîtront dans le menu d'outils MCP.

## Configuration Cursor / Continue

Mêmes principes : ajouter une entrée `mcpServers` avec `mcp-remote` pointant sur l'URL `/mcp`.

## Test manuel

Initialisation :
```bash
curl -X POST https://VOTRE-DOMAINE.replit.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

Lister les outils :
```bash
curl -X POST https://VOTRE-DOMAINE.replit.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Appeler un outil :
```bash
curl -X POST https://VOTRE-DOMAINE.replit.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"geocode","arguments":{"q":"Saint-Chamas"}}}'
```
