# Assistant BaSYS — Frontend

Interface utilisateur React/TypeScript de l'assistant documentaire BaSYS. Elle communique avec le backend via un proxy Vite en développement.

> **Prototype de démonstration.** L'interface affiche des données fictives issues de la base documentaire locale. Elles ne proviennent pas d'une installation BaSYS réelle.

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | 20 LTS |
| npm | 10 |
| Backend BaSYS | démarré sur le port 3000 |

---

## Installation

```powershell
cd frontend
npm install
```

---

## Démarrage en développement

```powershell
npm run dev
```

L'interface est accessible sur `http://localhost:5173`. Les appels `/api/*` sont proxifiés vers `http://127.0.0.1:3000`.

> Démarrer le backend avant le frontend pour que le statut API s'affiche correctement.

---

## Build de production

```powershell
npm run build
```

Les fichiers sont générés dans `dist/`. Servir le contenu statique avec n'importe quel serveur HTTP (nginx, `vite preview`, etc.).

```powershell
# Prévisualisation locale du build
npm run preview
```

---

## Fonctionnalités

### Assistant conversationnel
- Saisie de questions en langage naturel (français).
- Affichage des réponses du modèle local avec indicateur de chargement.
- Avertissement visible si la réponse a été tronquée (`truncated: true`).
- Bouton "Réessayer" en cas d'erreur réseau ou d'indisponibilité Ollama.

### Historique de conversations
- Plusieurs conversations gérées côté client (état React).
- Création d'une nouvelle conversation depuis la barre latérale.
- Navigation entre les conversations existantes.

### Sources et documents
- Affichage des sources consultées pour chaque réponse.
- Clic sur une source → lecteur de document en modal.
- Tags cliquables dans le lecteur → recherche dans la base documentaire.
- Page "Base documentaire" avec recherche par mots-clés.

### Suggestions de questions
- 4 questions de démarrage sur la maintenance et les équipements.
- Disponibles sur l'écran d'accueil (conversation vide).

### Statut API
- Indicateur en temps réel de la disponibilité du backend (vérification toutes les 30 secondes).

---

## Architecture

```
frontend/
├── src/
│   ├── App.tsx      # Composant principal — toute la logique UI
│   ├── App.css      # Styles — design system de l'application
│   ├── index.css    # Reset et base typographique
│   └── main.tsx     # Point d'entrée React
├── public/
├── index.html
├── vite.config.ts   # Proxy /api → localhost:3000
└── package.json
```

---

## Contrat API

Le frontend communique avec les endpoints suivants :

| Endpoint | Usage |
|---|---|
| `GET /api/health` | Vérification du statut API (polling 30 s) |
| `GET /api/knowledge?q=<terme>` | Recherche documentaire |
| `GET /api/knowledge/:slug` | Lecture d'un document complet |
| `POST /api/chat` | Envoi d'une question, réception de la réponse et des sources |

**Champs attendus dans la réponse `/api/chat` :**

```ts
{
  question: string
  answer: string
  sources: { slug: string; title: string; category: string; source: string }[]
  truncated?: true
  truncatedMessage?: string
}
```

---

## Limites connues

- **Pas de persistance.** Les conversations sont perdues au rechargement de la page (état React en mémoire uniquement).
- **Pas de streaming.** La réponse s'affiche en une seule fois après la génération complète.
- **Backend requis.** Sans backend démarré, toutes les fonctionnalités retournent une erreur.
- **Ollama requis.** Si Ollama n'est pas disponible, les questions reçoivent une erreur HTTP 504.
- **Données fictives.** Les documents affichés sont des exemples synthétiques sans lien avec BaSYS réel.
