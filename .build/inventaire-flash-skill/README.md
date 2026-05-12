# Inventaire Flash — Skill pour Claude / ChatGPT

Skill prête à l'emploi qui donne à Claude (Desktop ou claude.ai) ou à un GPT custom (ChatGPT) la capacité d'interroger **Inventaire Flash**, un outil de pré-diagnostic écologique pour les études d'impact environnemental (EIE) en France.

## Contenu

```
inventaire-flash-skill/
├── SKILL.md                    Skill principale (instructions Claude)
├── references/
│   ├── api-reference.md        Référence complète de l'API REST
│   ├── mcp-setup.md            Comment connecter le serveur MCP
│   └── eie-context.md          Rappels méthodologiques EIE
└── README.md                   Ce fichier
```

## Installation dans Claude

### Claude.ai (interface web)

1. Va dans **Capabilities → Skills → Upload skill**.
2. Téléverse le `.zip` (ou ce dossier compressé).
3. Avant utilisation, **édite `SKILL.md`** pour remplacer `VOTRE-DOMAINE.replit.app` par l'URL réelle de ton instance Inventaire Flash.

### Claude Desktop (avec MCP)

Plus puissant : connecte directement le serveur MCP de l'app — voir `references/mcp-setup.md`.

## Installation dans ChatGPT (Custom GPT)

ChatGPT n'a pas de format « skill » natif, mais tu peux :

1. Créer un **GPT personnalisé** (My GPTs → Create).
2. Coller le contenu de `SKILL.md` dans le champ **Instructions**.
3. Ajouter une **Action** (OpenAPI) pointant sur `https://VOTRE-DOMAINE.replit.app` — ChatGPT générera automatiquement le client à partir de la doc dans `references/api-reference.md`.
4. Optionnel : uploader les fichiers `references/*.md` comme **Knowledge** pour que le GPT puisse y consulter la doc en cas de besoin.

## Configuration requise

Une instance d'Inventaire Flash déployée et publique. L'API est ouverte (sans auth) — adapté à un usage interne ou un déploiement avec rate-limiting au niveau de l'hébergeur.
