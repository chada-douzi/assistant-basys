import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { KnowledgeDocument } from "./models/KnowledgeDocument.js";
import { generateAnswer } from "./services/llm.js";
import { extractEquipmentSummary } from "./equipment-summary.js";

export const app = express();
const port = Number(process.env.PORT ?? 3000);
const mongoUri = process.env.MONGODB_URI;
const ollamaModel = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

app.use(cors());
app.use(express.json({ limit: "20kb" }));

// Route existante : état du serveur
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "assistant-basys-api",
    timestamp: new Date().toISOString()
  });
});

// Route existante : recherche documentaire
app.get("/api/knowledge", async (req, res) => {
  const query = typeof req.query.q === "string"
    ? req.query.q.trim()
    : "";

  if (query.length < 2) {
    res.status(400).json({
      error: "La recherche doit contenir au moins 2 caractères.",
      example: "/api/knowledge?q=maintenance"
    });
    return;
  }

  if (query.length > 100) {
    res.status(400).json({
      error: "La recherche ne doit pas dépasser 100 caractères."
    });
    return;
  }

  try {
    // Normaliser les accents pour une recherche insensible aux accents
    const normalizeForSearch = (text: string): string =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fr");

    const normalizedQuery = normalizeForSearch(query);
    const terms = [...new Set(
      normalizedQuery.split(/\s+/).filter(Boolean)
    )];

    const allDocs = await KnowledgeDocument.find({})
      .select("slug title category content source tags")
      .lean();

    const results = allDocs
      .map((doc) => {
        const title = normalizeForSearch(doc.title ?? "");
        const category = normalizeForSearch(doc.category ?? "");
        const content = normalizeForSearch(doc.content ?? "");
        const source = normalizeForSearch(doc.source ?? "");
        const tags = (doc.tags ?? []).map(normalizeForSearch);

        let score = 0;
        let matchedTerms = 0;

        for (const term of terms) {
          const inTitle = title.includes(term);
          const inTags = tags.some((tag) => tag.includes(term));
          const inCategory = category.includes(term);
          const inContent = content.includes(term);
          const inSource = source.includes(term);

          if (inTitle || inTags || inCategory || inContent || inSource) {
            matchedTerms++;
          }

          if (inTitle) score += 5;
          if (inTags) score += 4;
          if (inCategory) score += 3;
          if (inContent) score += 1;
          if (inSource) score += 1;
        }

        return { doc, score, matchedTerms };
      })
      .filter((item) => item.matchedTerms > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.matchedTerms - a.matchedTerms
      )
      .slice(0, 5)
      .map((item) => item.doc);

    res.json({
      query,
      count: results.length,
      results
    });
  } catch (error) {
    console.error("Erreur de recherche documentaire :", error);
    res.status(500).json({
      error: "Impossible d'effectuer la recherche documentaire."
    });
  }
});

// Lire un document complet par son slug
app.get("/api/knowledge/:slug", async (req, res) => {
  const slug = req.params.slug;

  if (!slug || slug.length > 200) {
    res.status(400).json({ error: "Identifiant documentaire invalide." });
    return;
  }

  try {
    const document = await KnowledgeDocument.findOne({ slug })
      .select("slug title category content source tags createdAt updatedAt")
      .lean();

    if (!document) {
      res.status(404).json({ error: "Document introuvable." });
      return;
    }

    res.json({ document });
  } catch (error) {
    console.error("Erreur de lecture documentaire :", error);
    res.status(500).json({
      error: "Impossible de charger le document."
    });
  }
});

// Nouvelle route : assistant conversationnel avec RAG + Ollama
app.post("/api/chat", async (req, res) => {
  // ========== INSTRUMENTATION START ==========
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const perfStart = performance.now();
  const perf: Record<string, number> = {};
  // ========== INSTRUMENTATION END ==========

  const question = typeof req.body?.question === "string"
    ? req.body.question.trim()
    : "";

  if (question.length < 2) {
    res.status(400).json({
      error: "La question doit contenir au moins 2 caractères."
    });
    return;
  }

  if (question.length > 1000) {
    res.status(400).json({
      error: "La question ne doit pas dépasser 1000 caractères."
    });
    return;
  }

  try {
    perf.validation = performance.now() - perfStart;

    // 1. Extraire les mots utiles de la question
    const termExtractionStart = performance.now();
    const stopWords = new Set([
      "que", "quoi", "qui", "comment", "pourquoi", "quand",
      "quel", "quels", "quelle", "quelles",
      "faire", "faut", "peut", "peux", "dois", "est", "sont",
      "dans", "pour", "avec", "sans", "sur", "sous", "chez",
      "les", "des", "une", "un", "la", "le", "du", "de",
      "en", "et", "ou", "au", "aux", "ce", "ces", "cette",
      "mon", "ma", "mes", "son", "sa", "ses", "je", "tu",
      "il", "elle", "nous", "vous", "ils", "elles", "on",
      "y", "a", "d", "l", "ne", "pas", "plus", "cas"
    ]);

    // Normaliser la question pour traitement uniforme (avec et sans accents)
    const normalizeForProcessing = (text: string) =>
      text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const normalizedQuestion = normalizeForProcessing(question);

    const words: string[] = normalizedQuestion
      .toLocaleLowerCase("fr")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter((w: string) => w.length > 0);

    // Détecter les demandes exhaustives, y compris les formulations équivalentes.
    const normalizeSimple = (text: string) =>
      text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

    const normalizedWords = words.map(normalizeSimple);
    const normalizedQuestionForExhaustive = normalizeSimple(question);

    const exhaustiveKeywords = new Set([
      "tous", "toutes", "tout",
      "liste", "lister",
      "complet", "complete", "complets", "completes",
      "exhaustif", "exhaustive", "exhaustifs", "exhaustives",
      "entier", "entiere", "entiers", "entieres",
      "integral", "integrale", "integrals", "integrales"
    ]);

    const hasExhaustiveKeyword =
      normalizedWords.some(w => exhaustiveKeywords.has(w)) ||
      /\b(l'ensemble|ensemble des|toutes les informations|tous les elements|tous les details|toutes les donnees|detail complet|vue complete)\b/.test(normalizedQuestionForExhaustive);

    const terms: string[] = [
      ...new Set(
        words.filter(
          (term: string) => term.length >= 3 && !stopWords.has(term)
        )
      )
    ].slice(0, 10);
    const termExtractionEnd = performance.now();
    perf.termExtraction = termExtractionEnd - termExtractionStart;

    if (terms.length === 0) {
      res.json({
        question,
        answer: "Peux-tu reformuler ta question en précisant le sujet recherché ?",
        sources: []
      });
      return;
    }

    // 2. Rechercher les documents pertinents dans MongoDB
    // Fonction de normalisation pour recherche insensible aux accents
    const normalizeText = (value: unknown): string =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fr");

    const normalizedTerms = terms.map(normalizeText);

    // Détecter si la question contient un thème (pour limite adaptative)
    const containsEquipment = normalizedTerms.some(t =>
      t.includes("equipement") // Utiliser includes pour matcher "equipement" et "equipements"
    );
    const containsMaintenance = normalizedTerms.some(t =>
      t.includes("mainten") // Utiliser includes pour matcher "maintenance", "maintenances", etc.
    );

    // Limite adaptative de documents
    let documentLimit = 5; // Limite par défaut

    if (hasExhaustiveKeyword && containsEquipment && containsMaintenance) {
      documentLimit = 13; // Prévoir les équipements et les documents de maintenance
    } else if (hasExhaustiveKeyword && (containsEquipment || containsMaintenance)) {
      documentLimit = 10; // Limite étendue pour un seul thème
    }

    // Alias pour compatibilité avec le reste du code
    const hasEquipmentInQuestion = containsEquipment;
    const hasMaintenanceInQuestion = containsMaintenance;

    // Récupérer tous les documents pour filtrer avec normalisation
    const mongoStart = performance.now();
    const allDocs = await KnowledgeDocument.find({})
      .select("slug title category content source tags")
      .lean();
    perf.mongoFetch = performance.now() - mongoStart;

    const scoringStart = performance.now();
    const candidates = allDocs.filter((doc) => {
      const searchableFields = [
        normalizeText(doc.title),
        normalizeText(doc.content),
        normalizeText(doc.category),
        ...(doc.tags ?? []).map(normalizeText)
      ];

      return normalizedTerms.some(normalizedTerm =>
        searchableFields.some(field => field.includes(normalizedTerm))
      );
    });

const equipmentIds = [
  ...new Set(question.match(/\b[A-Z]{2,}-\d+\b/gi) ?? [])
].map(normalizeText);

const candidatesForScoring = equipmentIds.length > 0
  ? candidates.filter((doc) => {
      const searchableText = normalizeText([
        doc.title,
        doc.content,
        ...(doc.tags ?? [])
      ].join(" "));

      return equipmentIds.some((id) => searchableText.includes(id));
    })
  : candidates;

const scoreDocument = (
  doc: (typeof candidates)[number]
): number => {
  const title = normalizeText(doc.title);
  const category = normalizeText(doc.category);
  const content = normalizeText(doc.content);
  const tags = (doc.tags ?? []).map(normalizeText);

  let score = 0;

  // Détecter les thèmes principaux de la question
  const hasEquipmentInQuestion = normalizedTerms.some(t =>
    t === "equipement" || t === "equipements"
  );
  const hasMaintenanceInQuestion = normalizedTerms.some(t =>
    t === "maintenance" || t.includes("mainten")
  );

  // Super-boost pour correspondance de catégorie avec thème de question
  if (hasEquipmentInQuestion && category === "equipements") {
    score += 50; // Très fort boost pour fiches d'équipement
  }
  if (hasMaintenanceInQuestion && category === "maintenance") {
    score += 5; // Légère préférence catégorie maintenance, sans écraser la correspondance de titre
  }

  // Scoring basique par emplacement
  for (const term of terms) {
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

  // Une référence exacte d'équipement est prioritaire.
  for (const id of equipmentIds) {
    if (title.includes(id)) score += 1000;
    else if (content.includes(id)) score += 800;
    else if (tags.some((tag) => tag.includes(id))) score += 600;
  }

  return score;
};

// Trier par score décroissant
// Utiliser un seuil adaptatif : plus bas pour questions multi-thèmes
const hasEquipmentTheme = hasEquipmentInQuestion;
const hasMaintenanceTheme = hasMaintenanceInQuestion;
const hasMultipleThemes = hasEquipmentTheme && hasMaintenanceTheme;

const scoreThreshold = hasMultipleThemes ? 1 : 3;

const allScoredCandidates = candidatesForScoring
  .map((doc) => ({
    doc,
    score: scoreDocument(doc),
    category: doc.category
  }))
  .filter((item) => item.score >= scoreThreshold)
  .sort((a, b) => b.score - a.score);

// Log pour debug uniquement si exhaustive
let documents: typeof candidates;

if (hasMultipleThemes) {
  const isExhaustiveCombinedRequest =
    hasExhaustiveKeyword &&
    hasEquipmentTheme &&
    hasMaintenanceTheme &&
    equipmentIds.length === 0;

  if (isExhaustiveCombinedRequest) {
    // Inventaire exhaustif : la branche retourne volontairement tous les documents
    // des catégories concernées, sans appliquer documentLimit.
    // Raison : la réponse est déterministe (hors LLM) et doit être complète.
    // documentLimit=13 est utilisé uniquement par la branche multi-thèmes ordinaire ci-dessous.
    documents = allDocs.filter((doc) => {
      const category = normalizeText(doc.category);
      return category === "equipements" || category === "maintenance";
    });
  } else {
    // Comportement existant pour les questions multi-thèmes ordinaires.
    const equipmentDocs = allScoredCandidates.filter(
      (item) => normalizeText(item.category) === "equipements"
    );
    const maintenanceDocs = allScoredCandidates.filter(
      (item) => normalizeText(item.category) === "maintenance"
    );

    const selected: typeof allScoredCandidates = [];

    const minEquipment = Math.min(2, equipmentDocs.length);
    const minMaintenance = Math.min(2, maintenanceDocs.length);

    selected.push(...equipmentDocs.slice(0, minEquipment));
    selected.push(...maintenanceDocs.slice(0, minMaintenance));

    if (selected.length < documentLimit) {
      const remaining = allScoredCandidates.filter(
        (item) => !selected.some((selectedItem) =>
          selectedItem.doc.slug === item.doc.slug
        )
      );
      selected.push(...remaining.slice(0, documentLimit - selected.length));
    }

    documents = selected
      .sort((a, b) => b.score - a.score)
      .slice(0, documentLimit)
      .map((item) => item.doc);
  }
} else {
  // Pour une question ciblée, privilégier les titres correspondant
  // directement à l'intention exprimée.
  const targetedIntentTerms = new Set([
    "objectif", "objectifs", "definition", "definitions",
    "role", "roles", "but", "fonction", "fonctions"
  ]);

  const hasTargetedIntent = normalizedTerms.some((term) =>
    targetedIntentTerms.has(term)
  );

  const directlyMatchingTitles = hasTargetedIntent
    ? allScoredCandidates.filter((item) => {
        const title = normalizeText(item.doc.title);
        return normalizedTerms.some((term) =>
          targetedIntentTerms.has(term) && title.includes(term)
        );
      })
    : [];

  if (
    !hasExhaustiveKeyword &&
    directlyMatchingTitles.length > 0
  ) {
    // Pour les questions composées : compléter la sélection avec les candidats
    // pertinents pour les intentions secondaires de la question.
    // Détection : si des termes non couverts par les docs directs matchent
    // d'autres candidats, la question est composée et nécessite une complétion.
    //
    // Exemple : "objectif de la maintenance + planifier une intervention"
    //   → directlyMatchingTitles = [objectif-preventive-demo]
    //   → termes non couverts par ce doc : "planifier", "intervention"
    //   → allScoredCandidates contient planification-demo et intervention-demo
    //   → complétion activée

    // Vérifier si les docs directs couvrent l'ensemble des termes de la question
    const coveredByDirect = new Set<string>();
    for (const item of directlyMatchingTitles) {
      const title = normalizeText(item.doc.title);
      const content = normalizeText(item.doc.content);
      const tags = (item.doc.tags ?? []).map(normalizeText);
      for (const term of normalizedTerms) {
        if (title.includes(term) || content.includes(term) || tags.some(t => t.includes(term))) {
          coveredByDirect.add(term);
        }
      }
    }
    const hasUncoveredTerms = normalizedTerms.some(t => !coveredByDirect.has(t));

    if (hasUncoveredTerms) {
      // Question composée : compléter avec les candidats pour les termes non couverts
      const directSlugs = new Set(directlyMatchingTitles.map((item) => item.doc.slug));
      const complementary = allScoredCandidates
        .filter((item) => !directSlugs.has(item.doc.slug))
        .slice(0, Math.max(0, documentLimit - directlyMatchingTitles.length));

      documents = [
        ...directlyMatchingTitles.map((item) => item.doc),
        ...complementary.map((item) => item.doc),
      ];
    } else {
      // Question simple ciblée : les docs directs couvrent tous les termes
      documents = directlyMatchingTitles.map((item) => item.doc);
    }
  } else {
    // Conserver la sélection habituelle pour les autres questions.
    documents = allScoredCandidates
      .slice(0, documentLimit)
      .map((item) => item.doc);
  }
}

const scoringEnd = performance.now();
    perf.scoring = scoringEnd - scoringStart;

    if (documents.length === 0) {
      res.json({
        question,
        answer: "Je n'ai pas trouvé d'information pertinente dans la base documentaire de démonstration pour répondre à cette question. Ajoute des documents adaptés ou reformule ta question.",
        sources: []
      });
      return;
    }

    // 3. Préparer le contexte transmis au modèle
    const promptPrepStart = performance.now();
    const context = documents.map((doc) =>
      `Titre exact du document : ${doc.title}
Catégorie : ${doc.category}
Source : ${doc.source}
Contenu : ${doc.content}`
    ).join("\n\n---\n\n");

const systemPrompt = `
Tu es un assistant technique de démonstration. Réponds en français, clairement et directement, à partir des seuls documents fournis.

RÈGLES
- Présente uniquement des faits explicitement documentés. N'invente aucune valeur, date, durée, étape, commande, cause, procédure ou fonctionnalité.
- Ne déduis jamais un diagnostic, une cause, une conséquence ou une action à partir d'un simple statut.
- Si une information manque ou si les documents ne répondent que partiellement, indique précisément ce qui est connu et ce qui n'est pas renseigné.
- Pour une question simple, réponds en 2 à 3 phrases courtes. Pour une demande de liste ou d'exhaustivité, conserve tous les éléments pertinents présents dans les documents, sans en omettre volontairement.
- Ne prétends pas que la liste est exhaustive si les documents disponibles ne le permettent pas.
- Si aucun document pertinent ne répond à la question, indique-le clairement.
- N'invente ni source ni citation. Les titres exacts des documents peuvent être mentionnés si cela aide la compréhension.

LIMITES
- Les documents sont fictifs et servent uniquement à la démonstration ; ils ne constituent pas une documentation officielle de BaSYS.
- Ne prétends pas accéder au vrai BaSYS, consulter des données réelles, modifier une configuration ou exécuter une action sur un équipement.
- Si une procédure officielle manque, recommande de consulter la documentation officielle appropriée.
`.trim();


    const userPrompt = `
Question de l'utilisateur :
${question}

Documents disponibles :
${context}

Réponds à la question en utilisant uniquement ces documents.
    `.trim();
    const promptPrepEnd = performance.now();
    perf.promptPreparation = promptPrepEnd - promptPrepStart;

    // 4. Réponse déterministe pour les identifiants d'équipement connus.
    // Les questions générales continuent d'utiliser le flux LLM existant.
    const isExhaustiveInventoryRequest =
      hasExhaustiveKeyword &&
      containsEquipment &&
      containsMaintenance &&
      equipmentIds.length === 0;

    let answer: string;
    let llmTruncated = false; // true si Ollama a atteint la limite num_predict
    const equipmentSummaries = equipmentIds.length > 0
      ? documents
          .map((doc) => extractEquipmentSummary(doc))
          .filter((summary): summary is NonNullable<typeof summary> =>
            summary !== null &&
            equipmentIds.includes(normalizeText(summary.id))
          )
      : [];

    if (isExhaustiveInventoryRequest) {
      const inventorySummaries = documents
        .map((doc) => extractEquipmentSummary(doc))
        .filter((summary): summary is NonNullable<typeof summary> =>
          summary !== null
        )
        .sort((a, b) => a.id.localeCompare(b.id));

      const maintenanceDocuments = documents.filter(
        (doc) => normalizeText(doc.category) === "maintenance"
      );

      const equipmentSection = inventorySummaries.length > 0
        ? inventorySummaries.map((summary) => [
            `${summary.title}`,
            `Identifiant : ${summary.id}`,
            `Type : ${summary.equipmentType}`,
            `Emplacement : ${summary.location ?? "non renseigné dans la fiche"}`,
            `Statut : ${summary.status ?? "non renseigné dans la fiche"}`,
            `Dernière maintenance : ${summary.lastMaintenanceDate ?? "non renseignée dans la fiche"}`
          ].join("\n")).join("\n\n")
        : "Aucune fiche d'équipement exploitable n'a été trouvée.";

      const maintenanceSection = maintenanceDocuments.length > 0
        ? maintenanceDocuments.map((doc) =>
            `${doc.title}\n${doc.content}`
          ).join("\n\n")
        : "Aucun document de maintenance n'a été trouvé.";

      answer = [
        "INVENTAIRE DES ÉQUIPEMENTS",
        equipmentSection,
        "DOCUMENTATION DE MAINTENANCE DISPONIBLE",
        maintenanceSection,
        "Limite : cet inventaire reflète uniquement les documents récupérés dans la base documentaire de démonstration. Les données sont fictives et ne constituent pas un inventaire officiel de BaSYS."
      ].join("\n\n");

      perf.llmGeneration = 0;
    } else if (equipmentSummaries.length > 0) {
      answer = equipmentSummaries.map((summary) => [
        `${summary.title}`,
        `Identifiant : ${summary.id}`,
        `Type : ${summary.equipmentType}`,
        `Emplacement : ${summary.location ?? "non renseigné dans la fiche"}`,
        `Statut : ${summary.status ?? "non renseigné dans la fiche"}`,
        `Dernière maintenance : ${summary.lastMaintenanceDate ?? "non renseignée dans la fiche"}`,
        summary.isFictional
          ? "Note : ces données sont fictives et servent uniquement à la démonstration."
          : ""
      ].filter(Boolean).join("\n")).join("\n\n");

      perf.llmGeneration = 0;
    } else {
      const llmStart = performance.now();
      const llmResult = await generateAnswer({
        systemPrompt,
        userPrompt
      });
      answer = llmResult.answer;
      llmTruncated = llmResult.truncated;
      perf.llmGeneration = performance.now() - llmStart;
    }

    if (!answer) {
      res.status(502).json({
        error: "Le modèle n'a retourné aucune réponse."
      });
      return;
    }

    const formattingStart = performance.now();
    const formattingEnd = performance.now();
    perf.responseFormatting = formattingEnd - formattingStart;
    perf.total = performance.now() - perfStart;

    // Log structuré pour analyse
    console.log(JSON.stringify({
      requestId,
      timestamp: new Date().toISOString(),
      question: question.substring(0, 50) + (question.length > 50 ? "..." : ""),
      performance: {
        validation_ms: Number(perf.validation?.toFixed(2) || 0),
        termExtraction_ms: Number(perf.termExtraction?.toFixed(2) || 0),
        mongoFetch_ms: Number(perf.mongoFetch?.toFixed(2) || 0),
        scoring_ms: Number(perf.scoring?.toFixed(2) || 0),
        promptPreparation_ms: Number(perf.promptPreparation?.toFixed(2) || 0),
        llmGeneration_ms: Number(perf.llmGeneration?.toFixed(2) || 0),
        responseFormatting_ms: Number(perf.responseFormatting?.toFixed(2) || 0),
        total_ms: Number(perf.total?.toFixed(2) || 0)
      },
      retrievalDebug: {
        terms,
        topCandidates: allScoredCandidates.slice(0, 5).map((item) => ({
          title: item.doc.title,
          category: item.category,
          score: item.score
        })),
        selectedDocuments: documents.map((doc) => ({
          title: doc.title,
          category: doc.category
        }))
      },

      metadata: {
        termsExtracted: terms.length,
        documentsRetrieved: allDocs.length,
        documentsSelected: documents.length,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
        contextLength: context.length
      }
    }));

    // 5. Retourner la réponse et les sources réellement consultées
    res.json({
      question,
      answer: answer.trim(),
      sources: documents.map(doc => ({
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        source: doc.source
      })),
      ...(llmTruncated && {
        truncated: true,
        truncatedMessage: "La réponse a été tronquée en raison de la limite de génération du modèle. Elle peut être incomplète."
      })
    });
  } catch (error) {
    // Capturer la durée totale même en cas d'erreur
    perf.total = performance.now() - perfStart;

    // Log structuré avec requestId et durées partielles
    console.log(JSON.stringify({
      requestId,
      timestamp: new Date().toISOString(),
      error: true,
      errorType: error instanceof Error ? error.name : 'Unknown',
      performance: {
        validation_ms: Number(perf.validation?.toFixed(2) || 0),
        termExtraction_ms: Number(perf.termExtraction?.toFixed(2) || 0),
        mongoFetch_ms: Number(perf.mongoFetch?.toFixed(2) || 0),
        scoring_ms: Number(perf.scoring?.toFixed(2) || 0),
        promptPreparation_ms: Number(perf.promptPreparation?.toFixed(2) || 0),
        llmGeneration_ms: Number(perf.llmGeneration?.toFixed(2) || 0),
        total_ms: Number(perf.total?.toFixed(2))
      }
    }));

    console.error("Erreur dans /api/chat :", error);

    const isTimeout = error instanceof Error && error.name === "TimeoutError";

    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? "Le modèle a mis trop de temps à répondre. Réessaie."
        : "Impossible de traiter la question. Vérifie MongoDB et Ollama."
    });
  }
});


// Réponse JSON uniforme pour les routes inconnues.
app.use((_req, res) => {
  res.status(404).json({
    error: "Route introuvable."
  });
});

// Gestion centralisée des erreurs HTTP non traitées.
const apiErrorHandler: import("express").ErrorRequestHandler = (
  error,
  _req,
  res,
  next
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const details = error as { type?: string };

  if (details?.type === "entity.parse.failed") {
    res.status(400).json({
      error: "Corps JSON invalide."
    });
    return;
  }

  console.error("Erreur HTTP non gérée :", error);

  res.status(500).json({
    error: "Erreur interne du serveur."
  });
};

app.use(apiErrorHandler);

async function startServer(): Promise<void> {
  if (!mongoUri) {
    throw new Error("La variable MONGODB_URI est absente du fichier .env");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connecté.");

  app.listen(port, "127.0.0.1", () => {
    console.log(`API disponible sur http://127.0.0.1:${port}`);
    console.log(`Recherche : http://127.0.0.1:${port}/api/knowledge?q=maintenance`);
    console.log(`Assistant : http://127.0.0.1:${port}/api/chat`);
    console.log(`Modèle local : ${ollamaModel}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error: unknown) => {
    console.error("Impossible de démarrer le serveur :", error);
    process.exitCode = 1;
  });
}
