# Assistant BaSYS — Backend

API REST Node.js/TypeScript pour l'assistant documentaire BaSYS. Elle expose un pipeline RAG (Retrieval-Augmented Generation) qui sélectionne des documents pertinents depuis MongoDB, les transmet à un modèle local via Ollama, et renvoie une réponse fondée sur les documents disponibles.

> **Données de démonstration.** La base documentaire fournie contient 28 exemples fictifs. Ils ne proviennent pas d'une installation BaSYS réelle et ne doivent pas être utilisés à des fins opérationnelles.

---

## Prérequis

| Outil | Version minimale | Rôle |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| npm | 10 | Gestionnaire de paquets |
| MongoDB | 6 | Base documentaire |
| Ollama | dernière | Inférence LLM locale |

### Modèle Ollama

```powershell
ollama pull qwen2.5:3b
```

Vérifier que le modèle est disponible :

```powershell
ollama list
```

---

## Installation

```powershell
cd backend
npm install
```

---

## Configuration

Créer un fichier `.env` à la racine de `backend/` :

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/assistant-basys
LLM_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
```

| Variable | Valeur par défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port d'écoute de l'API |
| `MONGODB_URI` | — | URI de connexion MongoDB (obligatoire) |
| `LLM_PROVIDER` | `ollama` | Fournisseur LLM : `ollama` ou `claude` |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | URL du serveur Ollama local |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Modèle Ollama à utiliser |

> **Ne commettez jamais le fichier `.env`** dans le dépôt Git.

---

## Démarrage

### Mode développement (rechargement automatique)

```powershell
npm run dev
```

### Mode production

```powershell
npm run build
npm start
```

### Alimenter la base de démonstration

Le projet dispose de deux scripts de peuplement distincts. **Utilise uniquement `add-demo-documents.ts` pour un environnement de démonstration complet.**

#### Commande recommandée — 28 documents complets

```powershell
npx tsx src/add-demo-documents.ts
```

Insère ou met à jour **28 documents fictifs** (8 équipements, 7 maintenance, 5 procédures de diagnostic, 5 guides utilisateur, 3 FAQ). Idempotent : peut être relancé sans risque sur une base existante.

#### Script de développement minimal — `npm run seed`

```powershell
npm run seed
```

Exécute `src/seed.ts` et insère uniquement **4 documents** (1 guide, 1 procédure, 1 maintenance, 1 FAQ). Conçu pour des environnements de test légers.

> **Attention :** `seed.ts` et `add-demo-documents.ts` partagent le slug `maintenance-preventive-demo` avec des contenus légèrement différents. Exécuter `npm run seed` après `add-demo-documents.ts` écrase ce document avec la version allégée. Pour retrouver le dataset complet, relancer `npx tsx src/add-demo-documents.ts`.

---

## Endpoints

### `GET /api/health`

Vérification de l'état du serveur.

```json
{ "status": "ok", "service": "assistant-basys-api", "timestamp": "..." }
```

---

### `GET /api/knowledge?q=<terme>`

Recherche documentaire par mots-clés.

**Paramètres :**
- `q` (obligatoire) : terme de recherche, 2–100 caractères.

**Réponse :**
```json
{
  "query": "maintenance",
  "count": 3,
  "results": [
    {
      "slug": "maintenance-objectif-preventive-demo",
      "title": "Objectif de la maintenance préventive",
      "category": "Maintenance",
      "content": "...",
      "source": "Dataset fictif — prototype Assistant BaSYS",
      "tags": ["objectif", "maintenance préventive"]
    }
  ]
}
```

---

### `GET /api/knowledge/:slug`

Lecture d'un document complet par son identifiant.

**Réponse :**
```json
{
  "document": {
    "slug": "maintenance-objectif-preventive-demo",
    "title": "Objectif de la maintenance préventive",
    "category": "Maintenance",
    "content": "...",
    "source": "...",
    "tags": ["..."],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### `POST /api/chat`

Assistant conversationnel avec RAG.

**Corps de la requête :**
```json
{ "question": "Quel est l'objectif de la maintenance préventive ?" }
```

**Contraintes :** question de 2 à 1000 caractères.

**Réponse :**
```json
{
  "question": "Quel est l'objectif de la maintenance préventive ?",
  "answer": "La maintenance préventive vise à réduire les pannes...",
  "sources": [
    {
      "slug": "maintenance-objectif-preventive-demo",
      "title": "Objectif de la maintenance préventive",
      "category": "Maintenance",
      "source": "Dataset fictif — prototype Assistant BaSYS"
    }
  ]
}
```

**Champ optionnel `truncated` :** présent et `true` si la réponse du modèle a été coupée par la limite de génération. Dans ce cas, `truncatedMessage` contient un avertissement lisible.

---

## Pipeline RAG — synthèse

```
Question → tokenisation → détection thème/exhaustif → requête MongoDB
       → scoring des candidats → sélection documentaire
       → contexte LLM → génération Ollama → réponse + sources
```

**Limites documentaires :**
- Question standard : 5 documents
- Question exhaustive mono-thème (équipements ou maintenance) : 10 documents
- Question exhaustive combinée (équipements + maintenance) : inventaire complet (toutes catégories correspondantes)

**Chemin déterministe :** si la question demande un inventaire exhaustif combiné sans identifiant spécifique (EQ-xxx), la réponse est construite directement sans appel LLM.

---

## Tests

```powershell
# Suite complète
npm test

# Un fichier spécifique
npx vitest run src/__tests__/rag-pipeline.test.ts

# Tests unitaires RAG
npx vitest run src/__tests__/rag-utils.test.ts
```

**Résultat attendu :** 142 tests, 6 fichiers, 0 échec.

Les tests utilisent des mocks Vitest pour MongoDB et Ollama — aucune dépendance réseau n'est requise.

---

## Structure du projet

```
backend/
├── src/
│   ├── server.ts            # Express — routes et pipeline RAG
│   ├── services/
│   │   └── llm.ts           # Appels Ollama / Claude
│   ├── models/
│   │   └── KnowledgeDocument.ts  # Schéma Mongoose
│   ├── equipment-summary.ts  # Extraction structurée des fiches équipements
│   ├── rag-utils.ts         # Utilitaires de normalisation et scoring (tests unitaires)
│   ├── add-demo-documents.ts # Script de peuplement de la base
│   └── __tests__/           # Tests Vitest
├── .env                     # Configuration locale (non committé)
├── package.json
└── tsconfig.json
```

---

## Limites connues

- **Ollama requis localement.** L'API retourne HTTP 504 si Ollama ne répond pas dans les 120 secondes.
- **Données fictives.** Les 28 documents de démonstration ne proviennent pas d'une installation BaSYS réelle.
- **Recherche textuelle.** Le pipeline RAG repose sur des correspondances de mots-clés et un scoring lexical, sans embeddings ni recherche sémantique.
- **Pas de persistance des conversations.** L'historique est géré côté client uniquement.
- **Modèle `qwen2.5:3b`.** Les réponses peuvent être incomplètes ou imprécises pour des questions complexes. La limite de génération est de 512 tokens.
- **`rag-utils.ts`** exporte des fonctions de référence utilisées par les tests unitaires. Ces fonctions ne sont pas importées directement par `server.ts` — divergence documentée dans les audits internes.
