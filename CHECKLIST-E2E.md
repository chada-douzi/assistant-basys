# Checklist de tests bout-en-bout — Assistant BaSYS

Ce document décrit les vérifications manuelles et automatisées à effectuer avant toute livraison. Les tests automatisés (vitest) ne dépendent pas d'Ollama ni de MongoDB réels. Les tests d'intégration réels nécessitent les deux services démarrés.

---

## Prérequis pour les tests d'intégration réels

```powershell
# 1. MongoDB démarré
# 2. Ollama démarré avec le modèle chargé
ollama pull qwen2.5:3b

# 3. Base de démonstration peuplée (28 documents complets)
#    NE PAS utiliser "npm run seed" — ce script insère uniquement 4 documents
#    et écrase le doc maintenance-preventive-demo si la base est déjà peuplée.
cd backend
npx tsx src/add-demo-documents.ts

# 4. Backend démarré
npm run dev

# 5. Frontend démarré
cd frontend
npm run dev
```

---

## T01 — Démarrage du backend

**Type :** intégration réelle
**Commande :** `npm run dev` dans `backend/`
**Résultat attendu :** message `MongoDB connecté.` et `API disponible sur http://127.0.0.1:3000`
**Résultat à constater :** aucune erreur dans la console, pas de crash.

---

## T02 — Vérification de `/api/health`

**Type :** automatisé + intégration réelle
**Commande automatisée :**
```powershell
npx vitest run src/__tests__/server.integration.test.ts
```
**Vérification manuelle :**
```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```
**Résultat attendu :** `{ status: "ok", service: "assistant-basys-api", timestamp: "..." }`

---

## T03 — Récupération des documents de la base de connaissances

**Type :** intégration réelle
**Commande :**
```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/knowledge?q=maintenance"
```
**Résultat attendu :**
- Champ `count` ≥ 1
- Champ `results` est un tableau de documents avec `slug`, `title`, `category`, `content`, `source`, `tags`
- Aucun document de catégorie non pertinente dans les résultats

---

## T04 — Question simple

**Type :** automatisé + intégration réelle
**Question :** `"Quel est l'objectif de la maintenance préventive ?"`
**Commande automatisée :**
```powershell
npx vitest run src/__tests__/rag-pipeline.test.ts -t "question ciblée"
```
**Vérification manuelle :**
```powershell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:3000/api/chat" `
  -ContentType "application/json" `
  -Body '{"question":"Quel est l objectif de la maintenance preventive ?"}'
```
**Résultat attendu :**
- HTTP 200
- Champ `answer` non vide, en français
- `sources` contient au moins 1 document de catégorie Maintenance
- Pas d'invention : l'answer ne cite pas d'équipement non mentionné dans les sources

---

## T05 — Question multi-thèmes

**Type :** automatisé + intégration réelle
**Question :** `"Quels équipements nécessitent une maintenance ?"`
**Commande automatisée :**
```powershell
npx vitest run src/__tests__/rag-pipeline.test.ts -t "multi-thèmes"
```
**Résultat attendu :**
- HTTP 200
- `sources` contient des documents de catégorie Équipements ET Maintenance
- `sources.length` ≤ 5 (documentLimit multi-thèmes standard)

---

## T06 — Demande d'inventaire exhaustif (équipements seuls)

**Type :** automatisé + intégration réelle
**Question :** `"Donne-moi la liste complète des équipements"`
**Commande automatisée :**
```powershell
npx vitest run src/__tests__/rag-pipeline.test.ts -t "demande exhaustive équipements"
```
**Résultat attendu :**
- HTTP 200
- `sources.length` ≥ 2, uniquement catégorie Équipements (avec le dataset de démo)
- LLM appelé (pas de chemin déterministe)

---

## T07 — Demande combinant équipements et maintenance (inventaire complet)

**Type :** automatisé + intégration réelle
**Question :** `"Liste exhaustive de tous les équipements et toute la maintenance"`
**Commande automatisée :**
```powershell
npx vitest run src/__tests__/rag-pipeline.test.ts -t "inventaire exhaustif"
npx vitest run src/__tests__/rag-characterization.test.ts -t "T2"
```
**Résultat attendu :**
- HTTP 200
- Champ `answer` commence par `INVENTAIRE DES ÉQUIPEMENTS`
- `sources` contient des documents des deux catégories
- Aucun appel LLM (chemin déterministe)
- Avec la base de démonstration (28 docs, ~14 éligibles) : `sources.length` = nombre réel de docs équipements + maintenance

---

## T08 — Question sans réponse dans les documents

**Type :** automatisé + intégration réelle
**Question :** `"Quelle est la recette du couscous tunisien ?"`
**Commande automatisée :**
```powershell
npx vitest run src/__tests__/rag-pipeline.test.ts -t "hors domaine"
```
**Résultat attendu :**
- HTTP 200
- `sources` est un tableau vide
- `answer` indique explicitement l'absence d'information (pas d'invention)
- LLM non appelé

---

## T09 — Réponse contenant plusieurs sources

**Type :** automatisé
**Commande :**
```powershell
npx vitest run src/__tests__/rag-pipeline.test.ts -t "cohérence sources"
```
**Résultat attendu :**
- Chaque source du tableau `sources` a son titre présent dans le `userPrompt` transmis au LLM
- Aucune source fantôme (slug absent des documents réellement sélectionnés)

---

## T10 — Erreur ou indisponibilité d'Ollama

**Type :** automatisé
**Commande :**
```powershell
npx vitest run src/__tests__/rag-pipeline.test.ts -t "timeout Ollama"
npx vitest run src/__tests__/rag-pipeline.test.ts -t "erreur Ollama"
```
**Résultat attendu :**
- HTTP 504 si TimeoutError (AbortSignal déclenché)
- HTTP 500 pour toute autre erreur
- Le message d'erreur Ollama interne ne fuite pas dans la réponse JSON
- Aucune pile d'exception exposée au client

---

## T11 — Réponse tronquée (done_reason = "length")

**Type :** automatisé
**Commande :**
```powershell
npx vitest run src/__tests__/rag-pipeline.test.ts -t "troncature"
```
**Résultat attendu :**
- `truncated: true` présent dans la réponse JSON
- `truncatedMessage` non vide
- La réponse partielle est retournée telle quelle (pas supprimée)
- `sources` toujours présentes même si tronqué

**Note :** avec `num_predict=512`, les troncatures sont moins fréquentes qu'avec 192. Tester manuellement avec une question générant une longue réponse.

---

## T12 — Soumission depuis le frontend

**Type :** intégration réelle (navigateur)
**Prérequis :** backend + Ollama démarrés, frontend sur `http://localhost:5173`
**Étapes :**
1. Ouvrir `http://localhost:5173`
2. Taper une question dans la zone de saisie
3. Appuyer sur Entrée ou cliquer le bouton d'envoi
4. Observer l'indicateur de chargement (3 points animés)

**Résultat attendu :**
- Le bouton d'envoi se désactive pendant le chargement
- L'indicateur de chargement "Analyse des documents en cours…" s'affiche
- La réponse s'affiche après la génération
- Le bouton d'envoi se réactive

---

## T13 — Affichage des sources dans l'interface

**Type :** intégration réelle (navigateur)
**Étapes :**
1. Poser une question qui retourne des sources (ex. "maintenance préventive")
2. Cliquer sur le panneau "N sources consultées"
3. Cliquer sur une source dans la liste dépliée

**Résultat attendu :**
- Le panneau sources se déplie/replie au clic
- La modal de lecture du document s'ouvre
- Le contenu du document est affiché
- La fermeture (×, Fermer, clic sur l'overlay) fonctionne
- Les tags cliquables dans la modal lancent une recherche dans la base documentaire

---

## T14 — Affichage des erreurs et états de chargement

**Type :** intégration réelle (navigateur)
**Scénarios :**

### Backend arrêté
1. Arrêter le backend
2. Envoyer une question depuis le frontend

**Résultat attendu :**
- Message d'erreur affiché dans la bulle de réponse (texte rouge)
- Bouton "Réessayer ↻" visible
- L'indicateur de statut API passe à orange/offline

### Ollama arrêté (backend démarré, Ollama arrêté)
1. Poser une question qui passe par le LLM

**Résultat attendu :**
- Message d'erreur compréhensible affiché
- Pas de détail technique exposé (pas de "connection refused port 11434")

---

## T15 — Utilisation sur une largeur mobile (≤ 760 px)

**Type :** intégration réelle (DevTools navigateur — viewport 390 px)
**Vérifications :**
- La barre latérale est masquée par défaut
- Le bouton hamburger (☰) est visible et fonctionnel
- L'overlay de fermeture de la navigation fonctionne
- La zone de saisie est accessible et utilisable
- Les suggestions de questions s'affichent en colonne unique (≤ 390 px)
- Le lecteur de document est lisible sur mobile

---

## T16 — Absence d'erreurs bloquantes dans la console

**Type :** intégration réelle (navigateur)
**Vérifications :**
- Ouvrir DevTools → Console
- Naviguer dans toutes les vues (chat, base documentaire)
- Envoyer une question
- Ouvrir une source, cliquer sur un tag

**Résultat attendu :**
- Aucune erreur rouge dans la console
- Les avertissements React (si présents) ne bloquent pas le fonctionnement
- Aucune requête réseau échouée dans l'onglet Network (hors Ollama si non démarré)

---

## Tests automatisés — récapitulatif

```powershell
cd backend
npm test
# Résultat attendu : 142 tests, 6 fichiers, 0 échec
```

**Fichiers de tests :**

| Fichier | Couverture | Tests |
|---|---|---|
| `rag-utils.test.ts` | Fonctions de normalisation, extraction, scoring | 31 |
| `chat.behavior.test.ts` | Comportement de l'assistant (déterministe, LLM, sources) | 6 |
| `rag-pipeline.test.ts` | Pipeline complet, scénarios exhaustifs, erreurs | 41 |
| `rag-characterization.test.ts` | Caractérisation du comportement actuel (T1–T4) | 25 |
| `server.integration.test.ts` | Routes HTTP, validation des entrées, erreurs | ~39 |
| `equipment-summary.test.ts` | Extraction structurée des fiches équipements | — |

**Tests non couverts automatiquement (Ollama requis) :**
- Qualité réelle des réponses générées
- Troncature réelle (num_predict atteint)
- Performance de génération sous charge
- Comportement avec un modèle différent de `qwen2.5:3b`
