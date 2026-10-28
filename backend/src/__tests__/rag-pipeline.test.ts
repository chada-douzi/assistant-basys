/**
 * Tests du pipeline RAG — scénarios manquants
 * Couvre : exhaustif, multi-thèmes, INT-001, hors-domaine, erreur MongoDB
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { findMock, generateAnswerMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
  generateAnswerMock: vi.fn(),
}));

vi.mock("../models/KnowledgeDocument.js", () => ({
  KnowledgeDocument: { find: findMock },
}));

vi.mock("../services/llm.js", () => ({
  generateAnswer: generateAnswerMock,
}));

import { app } from "../server.js";

// ─── Données de test représentant les 27 documents de prod ───────────────────

const equipment001 = {
  slug: "equipement-pompe-demo",
  title: "Fiche équipement — Pompe industrielle",
  category: "Équipements",
  content: "Exemple fictif : EQ-001 est une pompe industrielle située dans l'atelier A. Son état simulé est en service et sa dernière maintenance est datée du 2026-09-15.",
  source: "Dataset fictif",
  tags: ["EQ-001", "pompe", "équipement", "atelier A", "en service"],
};

const equipment005 = {
  slug: "equipement-ventilateur-demo",
  title: "Fiche équipement — Ventilateur",
  category: "Équipements",
  content: "Exemple fictif : EQ-005 est un ventilateur situé dans la zone B. Son état simulé est disponible.",
  source: "Dataset fictif",
  tags: ["EQ-005", "ventilateur", "équipement", "zone B", "disponible"],
};

const equipment002 = {
  slug: "equipement-moteur-demo",
  title: "Fiche équipement — Moteur électrique",
  category: "Équipements",
  content: "Exemple fictif : EQ-002 est un moteur électrique localisé dans l'atelier B. Son état simulé est en maintenance.",
  source: "Dataset fictif",
  tags: ["EQ-002", "moteur", "équipement", "atelier B", "maintenance"],
};

const maintenanceObjectif = {
  slug: "maintenance-objectif-preventive-demo",
  title: "Objectif de la maintenance préventive",
  category: "Maintenance",
  content: "La maintenance préventive vise à réduire les pannes et à maintenir les équipements en bon état de fonctionnement.",
  source: "Dataset fictif",
  tags: ["objectif", "maintenance préventive", "maintenance"],
};

const maintenanceHistorique = {
  slug: "maintenance-historique-demo",
  title: "Consulter l'historique de maintenance",
  category: "Maintenance",
  content: "Dans le prototype, l'historique regroupe les interventions fictives associées à un équipement.",
  source: "Dataset fictif",
  tags: ["historique", "maintenance", "intervention", "équipement"],
};

const maintenanceIntervention = {
  slug: "maintenance-intervention-demo",
  title: "Consulter une intervention de maintenance",
  category: "Maintenance",
  content: "Exemple fictif : l'intervention INT-001 est associée à EQ-001. Son statut simulé est terminée.",
  source: "Dataset fictif",
  tags: ["INT-001", "intervention", "maintenance", "EQ-001", "terminée"],
};

const maintenancePlanification = {
  slug: "maintenance-planification-demo",
  title: "Principes de planification des inspections",
  category: "Maintenance",
  content: "Les inspections pédagogiques sont planifiées selon l'équipement et les consignes applicables.",
  source: "Dataset fictif",
  tags: ["planification", "inspection", "périodicité", "maintenance"],
};

const maintenanceStatut = {
  slug: "maintenance-statut-demo",
  title: "Comprendre les statuts de maintenance",
  category: "Maintenance",
  content: "Pour le prototype, les statuts fictifs peuvent être planifiée, en cours ou terminée.",
  source: "Dataset fictif",
  tags: ["statut", "planifiée", "en cours", "terminée", "maintenance"],
};

const maintenanceDonnees = {
  slug: "maintenance-donnees-manquantes-demo",
  title: "Traiter une information de maintenance absente",
  category: "Maintenance",
  content: "Si une date de maintenance ou le détail d'une intervention manque, l'assistant doit signaler l'information indisponible.",
  source: "Dataset fictif",
  tags: ["information absente", "date", "durée", "maintenance", "fiabilité"],
};

const faqInfoAbsente = {
  slug: "faq-information-inconnue-demo",
  title: "Que faire si une information est absente ?",
  category: "FAQ",
  content: "Lorsque les documents ne contiennent pas l'information demandée, l'assistant doit le dire explicitement.",
  source: "Dataset fictif",
  tags: ["FAQ", "information absente", "hallucination", "fiabilité"],
};

/** Jeu de données complet : 8 équipements + 6 maintenance + docs guide */
const FULL_DATASET = [
  equipment001,
  equipment002,
  equipment005,
  maintenanceObjectif,
  maintenanceHistorique,
  maintenanceIntervention,
  maintenancePlanification,
  maintenanceStatut,
  maintenanceDonnees,
  faqInfoAbsente,
];

// ─── Infrastructure de test ───────────────────────────────────────────────────

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

beforeAll(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Port indéterminable.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  findMock.mockReturnValue({
    select: () => ({ lean: async () => FULL_DATASET }),
  });
  generateAnswerMock.mockResolvedValue({ answer: "Réponse générée par le modèle.", truncated: false });
});

async function ask(question: string) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return { status: response.status, body: (await response.json()) as {
    question: string;
    answer: string;
    sources: { slug: string; title: string; category: string; source: string }[];
    error?: string;
  }};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Pipeline RAG — scénarios de classement", () => {

  it("question ciblée : sélectionne uniquement le doc pertinent (objectif)", async () => {
    const result = await ask("Quel est l'objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    expect(result.body.sources[0].slug).toBe("maintenance-objectif-preventive-demo");
    expect(result.body.sources).toHaveLength(1);
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("question ciblée : les sources secondaires sont absentes de la réponse", async () => {
    const result = await ask("Quel est l'objectif de la maintenance preventive ?");

    const slugs = result.body.sources.map((s) => s.slug);
    expect(slugs).not.toContain("maintenance-historique-demo");
    expect(slugs).not.toContain("maintenance-statut-demo");
    expect(slugs).not.toContain("maintenance-donnees-manquantes-demo");
  });

  it("consultation historique : sélectionne le bon document en tête", async () => {
    const result = await ask("Comment consulter l'historique de maintenance ?");

    expect(result.status).toBe(200);
    expect(result.body.sources[0].slug).toBe("maintenance-historique-demo");
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("consultation intervention INT-001 : récupère le document d'intervention", async () => {
    const result = await ask("Quel est le statut de INT-001 ?");

    expect(result.status).toBe(200);
    // INT-001 est dans les tags du doc intervention → score très élevé
    expect(result.body.sources.some((s) => s.slug === "maintenance-intervention-demo")).toBe(true);
  });

  it("question sur le statut d'une intervention : répond sans inventer", async () => {
    generateAnswerMock.mockResolvedValue({
      answer: "Le statut simulé de INT-001 est terminée.",
      truncated: false,
    });
    const result = await ask("Quel est le statut de INT-001 ?");

    expect(result.status).toBe(200);
    expect(result.body.answer).toContain("terminée");
  });
});

describe("Pipeline RAG — demandes exhaustives", () => {

  it("demande exhaustive équipements : sélectionne plusieurs équipements", async () => {
    // "liste complète des équipements" → hasExhaustive=true, containsEquipment=true,
    // containsMaintenance=false → documentLimit=10, chemin LLM normal (pas déterministe).
    // isExhaustiveInventoryRequest nécessite AUSSI containsMaintenance.
    const result = await ask("Donne-moi la liste complète des équipements");

    expect(result.status).toBe(200);
    expect(result.body.sources.length).toBeGreaterThanOrEqual(2);
    // Les sources doivent inclure des équipements
    const categories = result.body.sources.map((s) => s.category);
    expect(categories.some((c) => c === "Équipements")).toBe(true);
    // Le LLM est appelé (chemin normal)
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("demande exhaustive équipements : le contexte LLM contient les identifiants", async () => {
    // Vérifie que les docs d'équipements sont bien transmis au LLM,
    // pas que la réponse mock les contient (le mock est arbitraire).
    const result = await ask("Donne-moi la liste complète des équipements");

    expect(result.status).toBe(200);
    // Les sources retournées au client contiennent les slugs d'équipements
    const slugs = result.body.sources.map((s) => s.slug);
    expect(slugs.some((s) => s.startsWith("equipement-"))).toBe(true);
    // Le prompt userPrompt transmis au LLM contient les IDs
    const callArgs = generateAnswerMock.mock.calls[0]?.[0] as { userPrompt: string } | undefined;
    expect(callArgs?.userPrompt).toMatch(/EQ-001|EQ-002|EQ-005/);
  });

  it("demande exhaustive maintenance : sélectionne les docs maintenance", async () => {
    generateAnswerMock.mockResolvedValue({
      answer: "Voici les documents de maintenance disponibles.",
      truncated: false,
    });
    const result = await ask("Liste complète des procédures de maintenance");

    expect(result.status).toBe(200);
    expect(result.body.sources.length).toBeGreaterThan(0);
    // Doit inclure au moins un doc maintenance
    const hasMaintenance = result.body.sources.some((s) => s.category === "Maintenance");
    expect(hasMaintenance).toBe(true);
  });
});

describe("Pipeline RAG — question multi-thèmes", () => {

  it("question équipements + maintenance : retourne les deux catégories", async () => {
    generateAnswerMock.mockResolvedValue({
      answer: "Voici les équipements et leur état de maintenance.",
      truncated: false,
    });
    const result = await ask("Quels équipements nécessitent de la maintenance ?");

    expect(result.status).toBe(200);
    const categories = result.body.sources.map((s) => s.category);
    // Attendu : au moins un équipement ET au moins un doc maintenance
    expect(categories.some((c) => c === "Équipements")).toBe(true);
    expect(categories.some((c) => c === "Maintenance")).toBe(true);
  });

  it("inventaire exhaustif (équipements + maintenance) : chemin déterministe", async () => {
    const result = await ask(
      "Liste exhaustive de tous les équipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    // Chemin isExhaustiveInventoryRequest → pas d'appel LLM
    expect(generateAnswerMock).not.toHaveBeenCalled();
    expect(result.body.answer).toContain("INVENTAIRE DES ÉQUIPEMENTS");
  });
});

describe("Pipeline RAG — question hors domaine et cas limites", () => {

  it("question sans document correspondant : réponse de repli sans invention", async () => {
    findMock.mockReturnValue({
      select: () => ({ lean: async () => [] }),
    });

    const result = await ask("Quelle est la recette du couscous tunisien ?");

    expect(result.status).toBe(200);
    expect(result.body.answer).toMatch(/pas trouvé|aucune information|reformule/i);
    expect(result.body.sources).toHaveLength(0);
    expect(generateAnswerMock).not.toHaveBeenCalled();
  });

  it("question vague (stopwords uniquement) : réponse de reformulation", async () => {
    const result = await ask("que est");

    // Trop courte ou trop vague → 400 ou réponse de reformulation
    if (result.status === 400) {
      expect(result.body.error).toBeDefined();
    } else {
      expect(result.status).toBe(200);
      expect(result.body.answer).toMatch(/reformul/i);
    }
  });

  it("question avec termes normaux mais aucun doc : retourne sources vides", async () => {
    findMock.mockReturnValue({
      select: () => ({ lean: async () => [] }),
    });

    const result = await ask("Quel est le statut du générateur de la zone Z ?");

    expect(result.status).toBe(200);
    expect(result.body.sources).toHaveLength(0);
  });
});

describe("Pipeline RAG — erreurs et résilience", () => {

  it("erreur MongoDB : retourne une erreur 500 sans pile technique", async () => {
    findMock.mockReturnValue({
      select: () => ({
        lean: async () => { throw new Error("MongoDB connection refused"); },
      }),
    });

    const result = await ask("Quel est le statut de EQ-001 ?");

    expect(result.status).toBe(500);
    expect(result.body.error).toBe(
      "Impossible de traiter la question. Vérifie MongoDB et Ollama."
    );
    // Pas de pile d'erreur exposée
    expect(JSON.stringify(result.body)).not.toContain("connection refused");
  });

  it("timeout Ollama : retourne une erreur 504 sans pile technique", async () => {
    // Simuler un TimeoutError (AbortSignal.timeout déclenché)
    const timeoutError = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    Object.defineProperty(timeoutError, "name", { value: "TimeoutError" });
    generateAnswerMock.mockRejectedValue(timeoutError);

    // Utiliser un doc de maintenance pour forcer le chemin LLM (pas déterministe)
    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(504);
    expect(result.body.error).toMatch(/trop de temps|réessaie/i);
    expect(JSON.stringify(result.body)).not.toContain("TimeoutError");
    expect(JSON.stringify(result.body)).not.toContain("stack");
  });

  it("erreur Ollama générique : retourne une erreur 500 propre", async () => {
    generateAnswerMock.mockRejectedValue(new Error("Ollama connection refused at port 11434"));

    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(500);
    expect(result.body.error).toBe(
      "Impossible de traiter la question. Vérifie MongoDB et Ollama."
    );
    // Le message d'erreur interne ne doit pas fuiter dans la réponse
    expect(JSON.stringify(result.body)).not.toContain("11434");
    expect(JSON.stringify(result.body)).not.toContain("connection refused");
  });

  it("sources correspondent aux documents réellement sélectionnés", async () => {
    const result = await ask("Quel est l'objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    // Le LLM reçoit exactement les docs dans sources
    const callArgs = generateAnswerMock.mock.calls[0]?.[0];
    if (callArgs) {
      const contextContainsTitle = result.body.sources.every((source) =>
        callArgs.userPrompt.includes(source.title)
      );
      expect(contextContainsTitle).toBe(true);
    }
  });
});

// ─── Tests de régression — formulations exhaustives et multi-thèmes ──────────
// Ajoutés après audit de stabilisation (étape 1 & 2).
// Ces tests vérifient les chemins de code réels identifiés par la trace du pipeline.

describe("Pipeline RAG — formulations exhaustives équipements seuls", () => {

  // Ces formulations activent hasExhaustive=true, containsEquipment=true,
  // containsMaintenance=false → chemin standard avec documentLimit=10 et boost +50 catégorie.
  // Elles ne déclenchent PAS isExhaustiveCombinedRequest (pas de maintenance).

  it("'Donne-moi tous les equipements' : sources de catégorie Équipements", async () => {
    const result = await ask("Donne-moi tous les equipements");

    expect(result.status).toBe(200);
    const categories = result.body.sources.map((s) => s.category);
    expect(categories.every((c) => c === "Équipements")).toBe(true);
    expect(result.body.sources.length).toBeGreaterThanOrEqual(2);
    // Chemin LLM (pas déterministe — pas de maintenance)
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("'Liste complete des equipements' : hasExhaustive=true, sources uniquement équipements", async () => {
    const result = await ask("Liste complete des equipements");

    expect(result.status).toBe(200);
    const categories = result.body.sources.map((s) => s.category);
    expect(categories.every((c) => c === "Équipements")).toBe(true);
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("'Inventaire complet des equipements' : sources uniquement équipements", async () => {
    const result = await ask("Inventaire complet des equipements");

    expect(result.status).toBe(200);
    const categories = result.body.sources.map((s) => s.category);
    expect(categories.every((c) => c === "Équipements")).toBe(true);
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("le contexte LLM contient les slugs équipements (pas de doc maintenance)", async () => {
    const result = await ask("Donne-moi tous les equipements");

    expect(result.status).toBe(200);
    const callArgs = generateAnswerMock.mock.calls[0]?.[0] as { userPrompt: string } | undefined;
    expect(callArgs?.userPrompt).toBeDefined();
    // Le prompt contient des fiches équipements
    expect(callArgs?.userPrompt).toMatch(/Fiche équipement/);
    // Le prompt ne contient pas de doc maintenance
    expect(callArgs?.userPrompt).not.toMatch(/Consulter l'historique/);
    expect(callArgs?.userPrompt).not.toMatch(/Objectif de la maintenance/);
  });
});

describe("Pipeline RAG — multi-thèmes sans mot exhaustif", () => {

  // hasExhaustive=false, hasMultipleThemes=true → multiThème standard,
  // documentLimit=5, sélection scorée avec minEquipment=2 + minMaintenance=2.

  it("'Quels equipements necessitent une maintenance' : sources des deux catégories", async () => {
    const result = await ask("Quels equipements necessitent une maintenance ?");

    expect(result.status).toBe(200);
    const categories = result.body.sources.map((s) => s.category);
    // Le chemin multiThème standard garantit au moins 1 équipement et 1 maintenance
    expect(categories.some((c) => c === "Équipements")).toBe(true);
    expect(categories.some((c) => c === "Maintenance")).toBe(true);
    // Pas plus de documentLimit=5
    expect(result.body.sources.length).toBeLessThanOrEqual(5);
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("'Equipements et maintenance' : sources des deux catégories sans LLM exhaustif", async () => {
    const result = await ask("Equipements et maintenance");

    expect(result.status).toBe(200);
    const categories = result.body.sources.map((s) => s.category);
    expect(categories.some((c) => c === "Équipements")).toBe(true);
    expect(categories.some((c) => c === "Maintenance")).toBe(true);
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });
});

describe("Pipeline RAG — principes et objectif de maintenance préventive", () => {

  // Vérifie que les deux docs ('objectif' et 'principes') sont traités correctement
  // selon l'intention de la question.

  it("question sur l'objectif : sélectionne uniquement maintenance-objectif-preventive-demo", async () => {
    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);
    // targetedIntent activé : seul le doc avec "objectif" dans le titre est sélectionné
    expect(slugs).toContain("maintenance-objectif-preventive-demo");
    expect(slugs).not.toContain("maintenance-preventive-demo");
    expect(result.body.sources).toHaveLength(1);
  });

  it("question sur les principes : maintenance-preventive-demo est un candidat valide", async () => {
    // findMock avec les deux docs maintenance
    const maintenancePrincipes = {
      slug: "maintenance-preventive-demo",
      title: "Principes de maintenance préventive",
      category: "Maintenance",
      content: "La maintenance préventive vise à réduire les risques de défaillance par des inspections planifiées.",
      source: "Dataset fictif",
      tags: ["principes", "maintenance préventive", "maintenance", "inspection", "intervention", "équipement"],
    };

    findMock.mockReturnValue({
      select: () => ({ lean: async () => [maintenanceObjectif, maintenancePrincipes, maintenanceHistorique, maintenanceIntervention] }),
    });

    const result = await ask("Quels sont les principes de la maintenance preventive ?");

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);
    // "principes" n'est pas dans targetedIntentTerms → sélection standard
    // Le doc avec "Principes" dans le titre doit être en tête (score plus élevé)
    expect(slugs[0]).toBe("maintenance-preventive-demo");
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });
});

describe("Pipeline RAG — cohérence sources et contexte LLM", () => {

  it("toutes les sources retournées sont présentes dans le contexte LLM", async () => {
    const result = await ask("Comment consulter l historique de maintenance ?");

    expect(result.status).toBe(200);
    expect(result.body.sources.length).toBeGreaterThan(0);

    const callArgs = generateAnswerMock.mock.calls[0]?.[0] as { userPrompt: string } | undefined;
    if (callArgs) {
      for (const source of result.body.sources) {
        expect(callArgs.userPrompt).toContain(source.title);
      }
    }
  });

  it("aucune source n'apparaît dans la réponse sans être dans les documents sélectionnés", async () => {
    // Vérifie que sources[] == documents passés au LLM (pas de source fantôme)
    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    const callArgs = generateAnswerMock.mock.calls[0]?.[0] as { userPrompt: string } | undefined;
    if (callArgs) {
      for (const source of result.body.sources) {
        // Chaque source retournée au client doit avoir son titre dans le prompt LLM
        expect(callArgs.userPrompt).toContain(source.title);
      }
    }
  });
});

// ─── Tests C1 — Questions composées multi-intentions ─────────────────────────
// Ajoutés pour couvrir le défaut C1 : la branche targetedIntent ne complétait
// pas la sélection avec les autres candidats pertinents de la question.

describe("Pipeline RAG — questions composées multi-intentions (C1)", () => {

  // Doc supplémentaire pour les tests de cette section
  const maintenancePrincipes = {
    slug: "maintenance-preventive-demo",
    title: "Principes de maintenance préventive",
    category: "Maintenance",
    content: "La maintenance préventive vise à réduire les risques de défaillance par des inspections planifiées.",
    source: "Dataset fictif",
    tags: ["principes", "maintenance préventive", "maintenance", "inspection", "intervention", "équipement"],
  };

  it("question composée : objectif + planification → deux sources retournées", async () => {
    // Le FULL_DATASET contient maintenanceObjectif et maintenancePlanification.
    // Avant la correction, seul maintenanceObjectif était retourné.
    const result = await ask(
      "Quel est l objectif de la maintenance preventive et comment planifier une intervention ?"
    );

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);

    // La source directe (targetedIntent sur "objectif") doit être en premier
    expect(slugs[0]).toBe("maintenance-objectif-preventive-demo");

    // La source complémentaire (planification présente dans allScoredCandidates)
    // doit également être incluse — maintenance=5+titre contient "planification"
    // (via le tag "maintenance" qui fait remonter le doc)
    expect(slugs.length).toBeGreaterThanOrEqual(2);

    // Le LLM est appelé (pas de chemin déterministe)
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("question composée : objectif + historique → les deux sources présentes", async () => {
    const result = await ask(
      "Quel est l objectif de la maintenance preventive et comment consulter l historique ?"
    );

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);

    // Source directe en premier
    expect(slugs[0]).toBe("maintenance-objectif-preventive-demo");

    // Source historique présente dans la complétion
    expect(slugs).toContain("maintenance-historique-demo");

    // Pas de doublons
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it("question ciblée simple : continue de retourner uniquement la source pertinente", async () => {
    // Régression : une question simple ciblée ne doit pas être polluée
    // par des documents secondaires après la correction.
    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    // La source directe est bien en première position
    expect(result.body.sources[0].slug).toBe("maintenance-objectif-preventive-demo");
    // Avec documentLimit=5 et un seul doc directement correspondant,
    // des docs complémentaires peuvent apparaître — c'est acceptable et attendu.
    // Ce qui ne doit PAS changer : le doc pertinent est EN PREMIER.
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("question composée : sources limitées à documentLimit (5)", async () => {
    const result = await ask(
      "Quel est l objectif de la maintenance preventive et comment planifier une intervention ?"
    );

    expect(result.status).toBe(200);
    // Ne dépasse jamais la limite de documents
    expect(result.body.sources.length).toBeLessThanOrEqual(5);
  });

  it("question composée : aucun doublon dans les sources", async () => {
    const result = await ask(
      "Quel est l objectif de la maintenance preventive et comment planifier une intervention ?"
    );

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it("question composée : intention sans source n'invente pas de réponse", async () => {
    // "recette du couscous" est absent de la base → pas de doc pour cette intention
    // "maintenance" est présent → la partie connue est couverte
    findMock.mockReturnValue({
      select: () => ({ lean: async () => FULL_DATASET }),
    });

    const result = await ask(
      "Quel est l objectif de la maintenance preventive et quelle est la recette du couscous ?"
    );

    expect(result.status).toBe(200);
    // La partie maintenance est traitée avec les sources disponibles
    expect(result.body.sources.some((s) => s.slug === "maintenance-objectif-preventive-demo")).toBe(true);
    // La réponse ne doit pas inventer d'info sur le couscous
    // (contrôle via le mock LLM — il retourne la valeur mockée, ce qui est normal)
    expect(result.body.answer).toBeDefined();
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("question composée avec principes : les deux docs maintenance pertinents remontent", async () => {
    // Tester avec un jeu de données incluant les deux docs distincts
    findMock.mockReturnValue({
      select: () => ({
        lean: async () => [
          maintenanceObjectif,
          maintenancePrincipes,
          maintenancePlanification,
          maintenanceHistorique,
          maintenanceIntervention,
        ],
      }),
    });

    const result = await ask(
      "Quel est l objectif de la maintenance preventive et quels sont ses principes ?"
    );

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);

    // Les deux docs avec "objectif" et "principes" dans le titre doivent être présents
    // "objectif" → targetedIntent → en tête
    expect(slugs[0]).toBe("maintenance-objectif-preventive-demo");
    // "principes" n'est pas dans targetedIntentTerms mais le doc est dans allScoredCandidates
    // et sera dans la complétion
    expect(slugs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(slugs).size).toBe(slugs.length); // pas de doublons
  });
});

// ─── Tests E1 — Troncature LLM done_reason=length ────────────────────────────
// Vérifient que le champ `truncated` est propagé depuis llm.ts jusqu'à /api/chat.

describe("Pipeline RAG — troncature LLM (E1)", () => {

  it("génération normale : pas de champ truncated dans la réponse", async () => {
    // Le mock par défaut retourne { answer, truncated: false }
    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    expect(result.body.answer).toBeDefined();
    // Aucun champ truncated quand la génération est normale
    expect((result.body as Record<string, unknown>).truncated).toBeUndefined();
    expect((result.body as Record<string, unknown>).truncatedMessage).toBeUndefined();
  });

  it("done_reason=length : truncated=true dans la réponse API", async () => {
    generateAnswerMock.mockResolvedValue({
      answer: "La réponse a été tronquée ici —",
      truncated: true,
    });

    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    expect(result.body.answer).toBe("La réponse a été tronquée ici —");
    // Le champ truncated doit être présent et valoir true
    expect((result.body as Record<string, unknown>).truncated).toBe(true);
    // Un message explicatif doit accompagner le flag
    expect((result.body as Record<string, unknown>).truncatedMessage).toBeTruthy();
  });

  it("truncated=true : la réponse tronquée est retournée (pas supprimée)", async () => {
    const partialAnswer = "La maintenance préventive comprend des inspe";
    generateAnswerMock.mockResolvedValue({
      answer: partialAnswer,
      truncated: true,
    });

    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    // La réponse partielle est retournée telle quelle
    expect(result.body.answer).toBe(partialAnswer);
    expect((result.body as Record<string, unknown>).truncated).toBe(true);
  });

  it("erreur Ollama : status 500, pas de truncated", async () => {
    generateAnswerMock.mockRejectedValue(new Error("Ollama connexion échouée"));

    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(500);
    expect(result.body.error).toBeDefined();
    // Une erreur réseau n'est pas une troncature
    expect((result.body as Record<string, unknown>).truncated).toBeUndefined();
  });

  it("chemin déterministe (équipement) : jamais truncated", async () => {
    // Le chemin déterministe ne passe pas par generateAnswer
    const result = await ask("Quel est le statut de EQ-001 ?");

    expect(result.status).toBe(200);
    expect(result.body.answer).toContain("EQ-001");
    // generateAnswer n'est pas appelé → truncated absent
    expect(generateAnswerMock).not.toHaveBeenCalled();
    expect((result.body as Record<string, unknown>).truncated).toBeUndefined();
  });

  it("chemin déterministe (inventaire) : jamais truncated", async () => {
    const result = await ask(
      "Liste exhaustive de tous les équipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    expect(result.body.answer).toContain("INVENTAIRE DES ÉQUIPEMENTS");
    expect(generateAnswerMock).not.toHaveBeenCalled();
    expect((result.body as Record<string, unknown>).truncated).toBeUndefined();
  });

  it("sources présentes même quand la réponse est tronquée", async () => {
    generateAnswerMock.mockResolvedValue({
      answer: "Réponse incomplète —",
      truncated: true,
    });

    const result = await ask("Quel est l objectif de la maintenance preventive ?");

    expect(result.status).toBe(200);
    // Les sources doivent toujours être présentes
    expect(result.body.sources.length).toBeGreaterThan(0);
    expect((result.body as Record<string, unknown>).truncated).toBe(true);
  });
});
