# Suite de tests automatisés - Assistant BaSYS RAG

## Installation des dépendances

**Note importante :** L'installation automatique via npm a timeout lors de la configuration initiale. 

### Installation manuelle requise

Exécutez dans PowerShell (dans le dossier `backend`) :

```powershell
# Option 1: Installation complète
npm install --save-dev vitest @vitest/ui supertest @types/supertest

# Option 2: Si timeout, installer un par un
npm install --save-dev vitest
npm install --save-dev supertest @types/supertest
npm install --save-dev @vitest/ui
```

**Durée estimée :** 3-5 minutes (selon la connexion réseau)

## Vérification de l'installation

```powershell
npm list vitest supertest
```

Résultat attendu :
```
backend@1.0.0
├── @types/supertest@...
├── supertest@...
└── vitest@...
```

## Structure des tests

```
backend/
├── src/
│   ├── __tests__/
│   │   ├── rag-utils.test.ts          # Tests unitaires (44 tests)
│   │   └── server.integration.test.ts # Tests d'intégration API (à créer)
│   ├── rag-utils.ts                   # Fonctions utilitaires extraites
│   └── server.ts                      # Serveur principal (modifié)
├── vitest.config.ts                   # Configuration Vitest
└── package.json                       # Scripts de test ajoutés
```

## Commandes de test disponibles

### Tests unitaires uniquement (sans MongoDB, sans Ollama)

```powershell
npm run test:unit
```

**Durée :** < 1 seconde  
**Tests :** 44 tests unitaires (normalisation, extraction, scoring)

### Tous les tests

```powershell
npm test
```

**Durée :** < 5 secondes (unitaires) + variable (intégration si implémentés)

### Mode watch (re-test automatique)

```powershell
npm run test:watch
```

Surveille les fichiers et ré-exécute les tests à chaque modification.

### Interface graphique

```powershell
npm run test:ui
```

Ouvre une interface web interactive pour explorer les résultats.

## Tests unitaires implémentés

### Fichier : `src/__tests__/rag-utils.test.ts`

#### 1. Normalisation des accents (7 tests)
- ✅ Suppression accents français (`équipements` → `equipements`)
- ✅ Conversion minuscules (`ÉQUIPEMENTS` → `equipements`)
- ✅ Gestion `null`/`undefined`
- ✅ Préservation caractères non accentués

#### 2. Extraction identifiants (6 tests)
- ✅ Format `XX-NNN` (`EQ-003`, `INT-001`, `INC-001`)
- ✅ Extraction multiple
- ✅ Déduplication
- ✅ Normalisation minuscules
- ✅ Tableau vide si aucun

#### 3. Détection listes exhaustives (6 tests)
- ✅ Mots-clés : "liste complète", "tous", "exhaustif"
- ✅ Insensible accents
- ✅ Insensible casse
- ✅ False si absent

#### 4. Extraction termes (6 tests)
- ✅ Filtrage stopwords
- ✅ Filtrage termes courts (<3 caractères)
- ✅ Normalisation accents
- ✅ Limite nombre termes
- ✅ Déduplication

#### 5. Détection thèmes (4 tests)
- ✅ Thème équipement (`equipement`, `equipements`)
- ✅ Thème maintenance (`mainten*`)

#### 6. Limite adaptative (3 tests)
- ✅ 10 pour exhaustive + thème
- ✅ 5 sinon

#### 7. Scoring documents (7 tests)
- ✅ Boost massif identifiant exact (+1000)
- ✅ Boost catégorie équipement (+50)
- ✅ Boost catégorie maintenance (+30)
- ✅ Score terme dans titre (+10)
- ✅ Score 0 si aucune correspondance
- ✅ Accumulation scores multiples termes

#### 8. Seuil adaptatif (2 tests)
- ✅ Seuil 1 pour multi-thèmes
- ✅ Seuil 3 pour mono-thème

#### 9. Scénarios intégrés (4 tests)
- ✅ Pipeline recherche par ID exact
- ✅ Pipeline liste exhaustive
- ✅ Pipeline question multi-thèmes
- ✅ Pipeline question hors domaine

**Total : 44 tests unitaires**

## Modifications apportées au code de production

### Fichier créé : `src/rag-utils.ts`

**Raison :** Extraire les fonctions utilitaires depuis `server.ts` pour les rendre testables.

**Fonctions exportées :**
- `normalizeText()` - Normalisation NFD
- `extractEquipmentIds()` - Extraction identifiants
- `hasExhaustiveKeyword()` - Détection listes exhaustives
- `extractSearchTerms()` - Extraction termes + filtrage stopwords
- `containsEquipmentTheme()` - Détection thème équipement
- `containsMaintenanceTheme()` - Détection thème maintenance
- `calculateDocumentLimit()` - Limite adaptative
- `scoreDocument()` - Calcul score pertinence
- `calculateScoreThreshold()` - Seuil adaptatif

**Constantes exportées :**
- `STOP_WORDS` - Set stopwords français
- `EXHAUSTIVE_KEYWORDS` - Array mots-clés exhaustifs

### Fichier à modifier : `src/server.ts`

**Modification nécessaire :** Importer les fonctions depuis `rag-utils.ts` au lieu de les définir localement.

**Changements requis :**

```typescript
// Ajouter en haut du fichier
import {
  normalizeText,
  extractEquipmentIds,
  hasExhaustiveKeyword,
  extractSearchTerms,
  containsEquipmentTheme,
  containsMaintenanceTheme,
  calculateDocumentLimit,
  scoreDocument,
  calculateScoreThreshold,
  STOP_WORDS,
  EXHAUSTIVE_KEYWORDS
} from './rag-utils.js';
```

**Supprimer les définitions locales :**
- Lignes 48-54 : `normalizeForSearch()` → utiliser `normalizeText()`
- Lignes 116-127 : `stopWords` → utiliser `STOP_WORDS`
- Lignes 128-131 : `normalizeForProcessing()` → utiliser `normalizeText()`
- Lignes 139-141 : `exhaustiveKeywords`, `normalizeSimple()` → utiliser `EXHAUSTIVE_KEYWORDS`
- Lignes 163-169 : `normalizeText()` → déjà importé
- Lignes 211-218 : `equipmentIds` extraction → utiliser `extractEquipmentIds()`
- Lignes 224-279 : `scoreDocument()` → déjà importé
- Lignes 287-288 : `scoreThreshold` → utiliser `calculateScoreThreshold()`

**Impact :** Aucun changement de logique, uniquement refactorisation pour testabilité.

## Tests d'intégration (à implémenter)

### Fichier : `src/__tests__/server.integration.test.ts`

**Prérequis :** MongoDB actif sur `127.0.0.1:27017`

**Tests à créer :**
1. `POST /api/chat` avec ID exact → 1 source (EQ-003)
2. `POST /api/chat` liste exhaustive → 8 sources (EQ-001 à EQ-008)
3. `POST /api/chat` multi-thèmes → min 4 sources (2+2)
4. `POST /api/chat` hors domaine → 0 source
5. `POST /api/chat` question vide → HTTP 400
6. `POST /api/chat` question trop longue (>1000) → HTTP 400
7. `GET /api/health` → HTTP 200

**Note :** Ces tests NE DOIVENT PAS appeler Ollama (trop lent). Ils valident uniquement la sélection des sources documentaires.

## Résultats attendus

### Après installation et exécution de `npm run test:unit`

```
✓ src/__tests__/rag-utils.test.ts (44 tests) 45ms
  ✓ normalizeText (4)
  ✓ extractEquipmentIds (6)
  ✓ hasExhaustiveKeyword (6)
  ✓ extractSearchTerms (6)
  ✓ containsEquipmentTheme (2)
  ✓ containsMaintenanceTheme (2)
  ✓ calculateDocumentLimit (3)
  ✓ scoreDocument (7)
  ✓ calculateScoreThreshold (2)
  ✓ Scénarios intégrés (4)

Test Files  1 passed (1)
     Tests  44 passed (44)
  Start at  XX:XX:XX
  Duration  XXXms
```

## Dépannage

### Erreur : "Cannot find module 'vitest'"

```powershell
npm install --save-dev vitest
```

### Erreur : "Cannot find module './rag-utils.js'"

Le fichier `src/server.ts` doit importer depuis `./rag-utils.js` (pas encore fait).  
Voir section "Modifications à apporter" ci-dessus.

### Tests échouent après modification de server.ts

Vérifiez que :
1. L'import utilise bien l'extension `.js` (ESM requis)
2. Les fonctions appelées ont les mêmes signatures
3. Le code compilé est à jour : `npm run build`

### npm install timeout

Problème réseau ou proxy. Solutions :
1. Augmenter timeout : `npm config set fetch-timeout 600000`
2. Changer registry : `npm config set registry https://registry.npmjs.org/`
3. Installer via cache : supprimer `node_modules` et `package-lock.json`, puis réinstaller

## Prochaines étapes

1. **Installer les dépendances manuellement** (voir section Installation)
2. **Exécuter les tests unitaires** : `npm run test:unit`
3. **Modifier `src/server.ts`** pour importer depuis `rag-utils.ts`
4. **Recompiler** : `npm run build`
5. **Valider que le serveur fonctionne** : `npm start`
6. **Implémenter les tests d'intégration** (optionnel)

## Contact et support

Si les tests échouent de manière inattendue :
1. Vérifier les logs d'erreur Vitest
2. Comparer avec les résultats attendus ci-dessus
3. Vérifier que MongoDB contient bien 26 documents de démonstration

---

**Auteur :** Suite de tests créée le 13 octobre 2026  
**Framework :** Vitest 1.x
**Compatibilité :** Node.js 20.x, TypeScript 7.x, ESM
