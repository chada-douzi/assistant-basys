/**
 * Utilitaires RAG - Fonctions de normalisation, extraction et scoring
 * Extraites de server.ts pour permettre les tests unitaires
 */

/**
 * Normalise un texte pour recherche insensible aux accents
 * @param text - Texte à normaliser
 * @returns Texte normalisé en minuscules sans accents
 */
export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

/**
 * Stopwords français à filtrer lors de l'extraction des termes
 */
export const STOP_WORDS = new Set([
  "que", "quoi", "qui", "comment", "pourquoi", "quand",
  "quels", "quelle", "quelles", "quel",  // Ajout des formes interrogatives
  "faire", "faut", "peut", "peux", "dois", "est", "sont",
  "dans", "pour", "avec", "sans", "sur", "sous", "chez",
  "les", "des", "une", "un", "la", "le", "du", "de",
  "en", "et", "ou", "au", "aux", "ce", "ces", "cette",
  "mon", "ma", "mes", "son", "sa", "ses", "je", "tu",
  "il", "elle", "nous", "vous", "ils", "elles", "on",
  "y", "a", "d", "l", "ne", "pas", "plus", "cas"
]);

/**
 * Mots-clés indiquant une demande de liste exhaustive
 */
export const EXHAUSTIVE_KEYWORDS = [
  "tous", "toutes", "liste", "lister", "complet", "complete",
  "exhaustif", "exhaustive", "entier", "entiere", "integral", "integrale"
];

/**
 * Extrait les identifiants d'équipements (format XX-NNN)
 * @param text - Texte source
 * @returns Liste des identifiants normalisés
 */
export function extractEquipmentIds(text: string): string[] {
  const matches = text.match(/\b[A-Z]{2,}-\d+\b/gi) ?? [];
  return [...new Set(matches)].map(normalizeText);
}

/**
 * Détecte si la question demande une liste exhaustive
 * @param question - Question utilisateur
 * @returns true si mots-clés exhaustifs détectés
 */
export function hasExhaustiveKeyword(question: string): boolean {
  const normalized = normalizeText(question);
  const words = normalized.split(/\s+/);
  return words.some(word => EXHAUSTIVE_KEYWORDS.includes(word));
}

/**
 * Extrait les termes de recherche d'une question
 * Filtre les stopwords et limite la longueur minimale
 * @param question - Question utilisateur
 * @param maxTerms - Nombre maximum de termes (défaut: 10)
 * @returns Liste des termes normalisés
 */
export function extractSearchTerms(question: string, maxTerms: number = 10): string[] {
  const normalized = normalizeText(question);
  const words = normalized.split(/\s+/).filter((w: string) => w.length > 0);

  const terms = [
    ...new Set(
      words.filter((term: string) => term.length >= 3 && !STOP_WORDS.has(term))
    )
  ].slice(0, maxTerms);

  return terms;
}

/**
 * Détecte si la question contient le thème "équipement"
 * @param terms - Termes extraits
 * @returns true si thème équipement détecté
 */
export function containsEquipmentTheme(terms: string[]): boolean {
  return terms.some(t => t.includes("equipement"));
}

/**
 * Détecte si la question contient le thème "maintenance"
 * @param terms - Termes extraits
 * @returns true si thème maintenance détecté
 */
export function containsMaintenanceTheme(terms: string[]): boolean {
  return terms.some(t => t.includes("mainten"));
}

/**
 * Calcule la limite adaptative de documents selon le contexte
 * @param hasExhaustive - Demande de liste exhaustive
 * @param hasTheme - Au moins un thème détecté
 * @returns Limite de documents (5 ou 10)
 */
export function calculateDocumentLimit(hasExhaustive: boolean, hasTheme: boolean): number {
  return hasExhaustive && hasTheme ? 10 : 5;
}

/**
 * Interface d'un document pour le scoring
 */
export interface ScoredDocument {
  slug: string;
  title: string;
  category: string;
  content: string;
  tags?: string[];
}

/**
 * Paramètres de scoring
 */
export interface ScoringParams {
  terms: string[];
  equipmentIds: string[];
  hasEquipmentInQuestion: boolean;
  hasMaintenanceInQuestion: boolean;
}

/**
 * Calcule le score de pertinence d'un document
 * @param doc - Document à scorer
 * @param params - Paramètres de scoring
 * @returns Score numérique (plus élevé = plus pertinent)
 */
export function scoreDocument(doc: ScoredDocument, params: ScoringParams): number {
  const title = normalizeText(doc.title);
  const category = normalizeText(doc.category);
  const content = normalizeText(doc.content);
  const tags = (doc.tags ?? []).map(normalizeText);

  let score = 0;

  // Super-boost pour correspondance de catégorie avec thème de question
  if (params.hasEquipmentInQuestion && category === "equipements") {
    score += 50;
  }
  if (params.hasMaintenanceInQuestion && category === "maintenance") {
    score += 5; // Légère préférence catégorie maintenance, sans écraser la correspondance de titre
  }

  // Scoring basique par emplacement
  for (const term of params.terms) {
    const normalizedTerm = normalizeText(term);

    if (title.includes(normalizedTerm)) {
      score += 10;
    }
    if (tags.some((tag) => tag.includes(normalizedTerm))) {
      score += 6;
    }
    if (category.includes(normalizedTerm)) {
      score += 4;
    }
    if (content.includes(normalizedTerm)) {
      score += 1;
    }
  }

  // Une référence exacte d'équipement est prioritaire
  for (const id of params.equipmentIds) {
    if (title.includes(id)) score += 1000;
    else if (content.includes(id)) score += 800;
    else if (tags.some((tag) => tag.includes(id))) score += 600;
  }

  return score;
}

/**
 * Calcule le seuil de score adaptatif
 * @param hasMultipleThemes - Question multi-thèmes
 * @returns Seuil minimum (1 ou 3)
 */
export function calculateScoreThreshold(hasMultipleThemes: boolean): number {
  return hasMultipleThemes ? 1 : 3;
}
