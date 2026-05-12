# Inventaire Flash — Skill pour Claude / ChatGPT (via MCP)

Skill prête à l'emploi qui donne à Claude (Desktop, claude.ai) ou à un GPT custom (ChatGPT) la capacité d'interroger **Inventaire Flash** via son **serveur MCP**.

Inventaire Flash est un outil de pré-diagnostic écologique pour les études d'impact environnemental (EIE) en France, basé sur les données GBIF.

## Contenu

```
inventaire-flash-skill/
├── SKILL.md                    Skill principale (instructions Claude / GPT)
├── references/
│   ├── mcp-setup.md            Comment connecter le serveur MCP (Claude Desktop, Cursor, ChatGPT…)
│   ├── mcp-tools.md            Référence détaillée des 7 outils MCP avec schémas et exemples
│   └── eie-context.md          Rappels méthodologiques EIE (aires, presets, SINP, statuts)
└── README.md                   Ce fichier
```

## Avant utilisation

**Édite tous les fichiers** pour remplacer `VOTRE-DOMAINE.replit.app` par l'URL réelle de ton instance Inventaire Flash déployée (par exemple `inventaire-flash.replit.app`).

## Installation

### Claude Desktop (recommandé)

Ajoute à `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "inventaire-flash": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://VOTRE-DOMAINE.replit.app/mcp"]
    }
  }
}
```

Puis téléverse ce dossier comme **Skill** dans Claude (Capabilities → Skills → Upload skill) pour donner les instructions d'usage.

### Claude.ai (web)

- Settings → Connectors → Add custom connector → Streamable HTTP → URL `https://VOTRE-DOMAINE.replit.app/mcp`
- Capabilities → Skills → Upload skill (le `.zip` de ce dossier)

### ChatGPT (Custom GPT)

- Crée un GPT custom, colle `SKILL.md` dans Instructions.
- Ajoute un connector MCP pointant sur `https://VOTRE-DOMAINE.replit.app/mcp`.
- Optionnellement, uploade `references/*.md` comme Knowledge.

Voir `references/mcp-setup.md` pour tous les détails.

## Le serveur MCP est ouvert (sans auth)

Pas d'authentification — adapté à un usage interne ou un déploiement avec rate-limiting au niveau de l'hébergeur. L'outil `priority_species_for_location` consomme des crédits OpenAI à chaque appel.
