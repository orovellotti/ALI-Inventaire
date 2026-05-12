# Connecter le serveur MCP Inventaire Flash

Inventaire Flash expose un serveur **MCP (Model Context Protocol)** sur :

```
https://VOTRE-DOMAINE.replit.app/mcp
```

Mode : **Streamable HTTP, stateless** (pas de session), **sans authentification**.

---

## Claude Desktop

Claude Desktop ne parle nativement que MCP via stdio. On utilise le pont officiel `mcp-remote` pour l'adapter à HTTP.

Édite le fichier de config :
- macOS : `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows : `%APPDATA%\Claude\claude_desktop_config.json`

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

Redémarre Claude Desktop. Les 7 outils `inventaire-flash` apparaissent dans le menu des outils MCP.

---

## Claude.ai (web) — Custom Connectors

1. Va dans **Settings → Connectors → Add custom connector**.
2. Type : **Streamable HTTP**.
3. URL : `https://VOTRE-DOMAINE.replit.app/mcp`
4. Pas d'authentification.

Les outils sont ensuite disponibles dans tes conversations (selon ton plan Claude).

---

## Cursor

Édite `~/.cursor/mcp.json` ou la config projet :

```json
{
  "mcpServers": {
    "inventaire-flash": {
      "url": "https://VOTRE-DOMAINE.replit.app/mcp"
    }
  }
}
```

---

## ChatGPT — GPT custom avec « MCP server »

1. Crée un GPT personnalisé (My GPTs → Create).
2. Onglet **Configure**, section **Actions** ou **Connectors** (selon la version d'OpenAI), ajoute un serveur MCP :
   - Type : **MCP / Remote**
   - URL : `https://VOTRE-DOMAINE.replit.app/mcp`
3. Colle le contenu de `SKILL.md` dans **Instructions**.
4. Optionnel : uploade `references/*.md` dans **Knowledge**.

---

## Test rapide en cURL

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

Appeler `geocode` :
```bash
curl -X POST https://VOTRE-DOMAINE.replit.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"geocode","arguments":{"q":"Saint-Chamas"}}}'
```

Appeler `inventory_simple` :
```bash
curl -X POST https://VOTRE-DOMAINE.replit.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"inventory_simple","arguments":{"lat":43.5497,"lng":5.0341,"radius":2000}}}'
```
