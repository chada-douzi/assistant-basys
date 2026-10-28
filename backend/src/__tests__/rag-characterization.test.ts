/**
 * Tests de caractérisation du pipeline RAG — comportement actuel de /api/chat
 *
 * Ces tests décrivent le comportement RÉEL de la production au moment de l'audit
 * (28 octobre 2026). Ils ne valident pas une intention : ils documentent ce qui
 * se passe. Si un correctif change un comportement, le test correspondant devra
 * être mis à jour explicitement.
 *
 * Couvre :
 *   T1 — requête exhaustive mono-thème ("tout")
 *   T2 — requête exhaustive combinée équipements + maintenance
 *   T3 — limite de documents avec dataset étendu (16 docs éligibles)
 *   T4 — formulations exhaustives variantes et comportement de l'apostrophe
 *
 * Aucun appel réel à Ollama ou à MongoDB.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks MongoDB et LLM ─────────────────────────────────────────────────────
// Même pattern que rag-pipeline.test.ts : vi.hoisted garantit que les mocks
// sont définis avant l'import d'app qui charge server.ts.

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

// ─── Infrastructure HTTP ──────────────────────────────────────────────────────

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

beforeAll(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Port indéterminable.");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  // Dataset par défaut : 3 équipements + 6 maintenance (9 éligibles au chemin combiné)
  findMock.mockReturnValue({
    select: () => ({ lean: async () => DEFAULT_DATASET }),
  });
  generateAnswerMock.mockResolvedValue({
    answer: "Réponse simulée par le mock LLM.",
    truncated: false,
  });
});

async function ask(question: string) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      question: string;
      answer: string;
      sources: { slug: string; title: string; category: string; source: string }[];
      error?: string;
      truncated?: boolean;
    },
  };
}

// ─── Datasets synthétiques ────────────────────────────────────────────────────
// Tous les documents sont fictifs et ne représentent pas une installation BaSYS réelle.

/** Dataset par défaut : 3 équipements + 6 maintenance = 9 docs éligibles au chemin combiné. */
const DEFAULT_DATASET = [
  {
    slug: "char-eq-001",
    title: "Fiche équipement EQ-001",
    category: "Équipements",
    content: "EQ-001 est un équipement fictif de démonstration. Emplacement : zone A.",
    source: "Dataset caractérisation",
    tags: ["EQ-001", "équipement"],
  },
  {
    slug: "char-eq-002",
    title: "Fiche équipement EQ-002",
    category: "Équipements",
    content: "EQ-002 est un équipement fictif de démonstration. Emplacement : zone B.",
    source: "Dataset caractérisation",
    tags: ["EQ-002", "équipement"],
  },
  {
    slug: "char-eq-003",
    title: "Fiche équipement EQ-003",
    category: "Équipements",
    content: "EQ-003 est un équipement fictif de démonstration. Emplacement : zone C.",
    source: "Dataset caractérisation",
    tags: ["EQ-003", "équipement"],
  },
  {
    slug: "char-maint-001",
    title: "Procédure de maintenance 1",
    category: "Maintenance",
    content: "Procédure fictive de maintenance périodique pour les équipements de zone A.",
    source: "Dataset caractérisation",
    tags: ["maintenance", "procédure"],
  },
  {
    slug: "char-maint-002",
    title: "Procédure de maintenance 2",
    category: "Maintenance",
    content: "Procédure fictive de maintenance corrective pour les équipements de zone B.",
    source: "Dataset caractérisation",
    tags: ["maintenance", "procédure"],
  },
  {
    slug: "char-maint-003",
    title: "Procédure de maintenance 3",
    category: "Maintenance",
    content: "Procédure fictive d'inspection pour les équipements de zone C.",
    source: "Dataset caractérisation",
    tags: ["maintenance", "inspection"],
  },
  {
    slug: "char-maint-004",
    title: "Procédure de maintenance 4",
    category: "Maintenance",
    content: "Procédure fictive de lubrification pour les équipements.",
    source: "Dataset caractérisation",
    tags: ["maintenance", "lubrification"],
  },
  {
    slug: "char-maint-005",
    title: "Procédure de maintenance 5",
    category: "Maintenance",
    content: "Procédure fictive de remplacement de pièces pour les équipements.",
    source: "Dataset caractérisation",
    tags: ["maintenance", "remplacement"],
  },
  {
    slug: "char-maint-006",
    title: "Procédure de maintenance 6",
    category: "Maintenance",
    content: "Procédure fictive de nettoyage pour les équipements.",
    source: "Dataset caractérisation",
    tags: ["maintenance", "nettoyage"],
  },
];

/**
 * Dataset étendu pour T3 : 8 équipements + 8 maintenance = 16 docs éligibles.
 * Dépasse délibérément la limite documentLimit=13 pour caractériser l'absence
 * de .slice() dans la branche isExhaustiveCombinedRequest.
 */
const EXTENDED_DATASET_16 = [
  ...Array.from({ length: 8 }, (_, i) => ({
    slug: `char-ext-eq-0${i + 1}`,
    title: `Fiche équipement EXT-0${i + 1}`,
    category: "Équipements",
    content: `EXT-0${i + 1} est un équipement fictif de démonstration pour les tests de caractérisation.`,
    source: "Dataset caractérisation étendu",
    tags: [`EXT-0${i + 1}`, "équipement"],
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    slug: `char-ext-maint-0${i + 1}`,
    title: `Procédure de maintenance EXT-${i + 1}`,
    category: "Maintenance",
    content: `Procédure fictive EXT-${i + 1} pour les équipements de démonstration.`,
    source: "Dataset caractérisation étendu",
    tags: ["maintenance", "procédure"],
  })),
];

// ─────────────────────────────────────────────────────────────────────────────
// T1 — Requête exhaustive mono-thème ("tout")
// ─────────────────────────────────────────────────────────────────────────────
//
// Trace de production :
//   "tout" ∈ exhaustiveKeywords → hasExhaustiveKeyword=true
//   containsEquipment=true, containsMaintenance=false
//   → documentLimit=10, hasMultipleThemes=false
//   → branche mono-thème : allScoredCandidates.slice(0, 10)
//   → LLM appelé (pas de chemin déterministe)
//
// L'apostrophe dans "tout l'inventaire" est supprimée par
// replace(/[^\p{L}\p{N}\s-]/gu, " ") avant le split. La version sans
// apostrophe produit exactement le même résultat.

describe("T1 — Requête exhaustive mono-thème ('tout')", () => {

  it("'tout' singulier active hasExhaustiveKeyword=true", async () => {
    const result = await ask("tout l inventaire des equipements");

    expect(result.status).toBe(200);
    // hasExhaustiveKeyword=true et containsMaintenance=false
    // → isExhaustiveCombinedRequest=false → le LLM est appelé
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });

  it("documentLimit=10 pour 'tout' + équipements seuls : sources uniquement équipements", async () => {
    const result = await ask("tout l inventaire des equipements");

    expect(result.status).toBe(200);
    // Boost +50 pour catégorie "equipements" → les 3 équipements du dataset
    // passent en tête et occupent les 3 premières places du slice(0,10)
    const categories = result.body.sources.map((s) => s.category);
    expect(categories.every((c) => c === "Équipements")).toBe(true);
  });

  it("'tout' + équipements seuls : 3 sources retournées sur 9 docs totaux", async () => {
    // documentLimit=10, mais le boost +50 catégorie et le seuil de score
    // éliminent les docs maintenance qui ne matchent pas "equipement"
    const result = await ask("tout l inventaire des equipements");

    expect(result.status).toBe(200);
    // Comportement actuel : 3 équipements remontent (les seuls avec score élevé)
    expect(result.body.sources.length).toBe(3);
  });

  it("le contexte LLM transmis contient les fiches d'équipements", async () => {
    const result = await ask("tout l inventaire des equipements");

    expect(result.status).toBe(200);
    const callArgs = generateAnswerMock.mock.calls[0]?.[0] as
      { userPrompt: string } | undefined;
    // Les titres des équipements sont dans le prompt
    expect(callArgs?.userPrompt).toContain("Fiche équipement EQ-001");
    expect(callArgs?.userPrompt).toContain("Fiche équipement EQ-002");
    expect(callArgs?.userPrompt).toContain("Fiche équipement EQ-003");
  });

  it("non-régression : 'liste complete des equipements' produit le même comportement", async () => {
    const resultTout = await ask("tout l inventaire des equipements");
    vi.clearAllMocks();
    generateAnswerMock.mockResolvedValue({
      answer: "Réponse simulée par le mock LLM.",
      truncated: false,
    });
    findMock.mockReturnValue({
      select: () => ({ lean: async () => DEFAULT_DATASET }),
    });
    const resultListe = await ask("liste complete des equipements");

    expect(resultTout.status).toBe(200);
    expect(resultListe.status).toBe(200);
    // Les deux formulations activent hasExhaustiveKeyword=true par des chemins différents
    // ("tout" via Set, "complete" via Set) mais produisent le même résultat
    expect(resultTout.body.sources.map((s) => s.slug))
      .toEqual(resultListe.body.sources.map((s) => s.slug));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — Requête exhaustive combinée équipements + maintenance
// ─────────────────────────────────────────────────────────────────────────────
//
// Trace de production :
//   hasExhaustiveKeyword=true, containsEquipment=true, containsMaintenance=true
//   → documentLimit=13 (calculé)
//   → hasMultipleThemes=true → isExhaustiveCombinedRequest=true
//   → documents = allDocs.filter(cat ∈ {equipements, maintenance})
//   → PAS de .slice(0, documentLimit)
//   → chemin déterministe : generateAnswer N'EST PAS appelé
//   → réponse commence par "INVENTAIRE DES ÉQUIPEMENTS"

describe("T2 — Requête exhaustive combinée équipements + maintenance", () => {

  it("chemin déterministe activé : LLM non appelé", async () => {
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    expect(generateAnswerMock).not.toHaveBeenCalled();
  });

  it("la réponse contient le marqueur du chemin déterministe", async () => {
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    expect(result.body.answer).toContain("INVENTAIRE DES ÉQUIPEMENTS");
  });

  it("avec DEFAULT_DATASET (9 éligibles) : 9 sources retournées", async () => {
    // documentLimit=13 est calculé mais jamais appliqué (.slice absent)
    // → le filtre retourne TOUS les docs des catégories concernées
    // → avec 9 docs éligibles : 9 sources
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    expect(result.body.sources.length).toBe(9);
  });

  it("les sources couvrent les deux catégories", async () => {
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    const categories = result.body.sources.map((s) => s.category);
    expect(categories.some((c) => c === "Équipements")).toBe(true);
    expect(categories.some((c) => c === "Maintenance")).toBe(true);
  });

  it("les docs FAQ ne sont pas inclus dans la réponse", async () => {
    // La branche filtre uniquement 'equipements' et 'maintenance'
    // Un doc FAQ présent dans allDocs ne doit pas apparaître
    const datasetAvecFaq = [
      ...DEFAULT_DATASET,
      {
        slug: "char-faq-001",
        title: "FAQ : question générale",
        category: "FAQ",
        content: "Réponse fictive à une question fréquente sur les équipements et la maintenance.",
        source: "Dataset caractérisation",
        tags: ["faq", "équipement", "maintenance"],
      },
    ];
    findMock.mockReturnValue({
      select: () => ({ lean: async () => datasetAvecFaq }),
    });

    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);
    expect(slugs).not.toContain("char-faq-001");
    // 9 docs éligibles (pas le FAQ) → 9 sources
    expect(result.body.sources.length).toBe(9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — Limite de documents avec dataset étendu (16 docs éligibles)
// ─────────────────────────────────────────────────────────────────────────────
//
// Objectif : caractériser le comportement de la branche isExhaustiveCombinedRequest
// lorsque le nombre de docs éligibles (16) dépasse documentLimit (13).
//
// COMPORTEMENT ACTUEL DÉMONTRÉ : la limite 13 est calculée (ligne ~261 de server.ts)
// mais la branche isExhaustiveCombinedRequest ne contient aucun .slice(0, documentLimit).
// Le filtre allDocs.filter(...) retourne tous les docs des catégories concernées.
// Avec 16 docs éligibles, l'API retourne 16 sources, pas 13.
//
// Ce test CONSTATE ce comportement. Si un correctif ajoute .slice(0, documentLimit),
// le test échouera et devra être mis à jour pour refléter la nouvelle limite.

describe("T3 — Limite de documents avec dataset étendu (16 éligibles)", () => {

  beforeEach(() => {
    findMock.mockReturnValue({
      select: () => ({ lean: async () => EXTENDED_DATASET_16 }),
    });
  });

  it("caractérisation : 16 docs éligibles → 16 sources retournées (documentLimit=13 non appliqué)", async () => {
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    expect(generateAnswerMock).not.toHaveBeenCalled(); // chemin déterministe

    // COMPORTEMENT ACTUEL : la branche isExhaustiveCombinedRequest filtre allDocs
    // sans .slice(0, documentLimit). Avec 16 docs éligibles, 16 sources sont retournées.
    // documentLimit=13 est calculé mais inutilisé dans ce chemin.
    //
    // Si ce test échoue avec sources.length === 13 après un correctif, mettre à jour
    // l'assertion en toBe(13) et supprimer ce commentaire.
    expect(result.body.sources.length).toBe(16);
  });

  it("les 8 équipements du dataset étendu sont tous présents dans les sources", async () => {
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);
    for (let i = 1; i <= 8; i++) {
      expect(slugs).toContain(`char-ext-eq-0${i}`);
    }
  });

  it("les 8 docs de maintenance du dataset étendu sont tous présents dans les sources", async () => {
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    const slugs = result.body.sources.map((s) => s.slug);
    for (let i = 1; i <= 8; i++) {
      expect(slugs).toContain(`char-ext-maint-0${i}`);
    }
  });

  it("l'ordre des sources reflète l'ordre d'insertion dans allDocs (équipements en premier)", async () => {
    // La branche isExhaustiveCombinedRequest n'applique pas de .sort()
    // L'ordre correspond à l'ordre de retour de KnowledgeDocument.find(),
    // qui dans le test est l'ordre du tableau EXTENDED_DATASET_16.
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    // Les 8 premières sources sont des équipements (premier dans le tableau)
    const first8 = result.body.sources.slice(0, 8);
    expect(first8.every((s) => s.category === "Équipements")).toBe(true);
    // Les 8 suivantes sont de la maintenance
    const last8 = result.body.sources.slice(8, 16);
    expect(last8.every((s) => s.category === "Maintenance")).toBe(true);
  });

  it("la réponse contient le marqueur du chemin déterministe même avec 16 docs", async () => {
    const result = await ask(
      "Liste exhaustive de tous les equipements et toute la maintenance"
    );

    expect(result.status).toBe(200);
    expect(result.body.answer).toContain("INVENTAIRE DES ÉQUIPEMENTS");
    expect(generateAnswerMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — Formulations exhaustives variantes et comportement de l'apostrophe
// ─────────────────────────────────────────────────────────────────────────────
//
// Trace pour "l'ensemble des équipements" (toute apostrophe) :
//   normalizeForProcessing conserve l'apostrophe
//   replace(/[^\p{L}\p{N}\s-]/gu, " ") supprime l'apostrophe → ["l","ensemble","des","equipements"]
//   normalizedWords = ["l","ensemble","des","equipements"]
//   exhaustiveKeywords.has("ensemble") → false (absent du Set)
//   normalizedQuestionForExhaustive = normalizeSimple(question) conserve l'apostrophe
//   regex /\b(l'ensemble|...)/.test(normalizedQuestionForExhaustive) → true
//   → hasExhaustiveKeyword=true via regex
//   → containsEquipment=true, containsMaintenance=false → documentLimit=10
//   → branche mono-thème → LLM appelé
//
// NOTE VÉRIFIÉE : en V8, la regex /\b(l'ensemble)/ avec U+0027 dans le pattern
// matche AUSSI les chaînes contenant U+2019 (apostrophe typographique).
// Les deux apostrophes produisent le même comportement : hasExhaustiveKeyword=true.

describe("T4 — Formulations exhaustives variantes", () => {

  describe("T4-A : 'tout' (via Set exhaustiveKeywords)", () => {

    it("'tout l inventaire des equipements' : LLM appelé, sources équipements", async () => {
      const result = await ask("tout l inventaire des equipements");

      expect(result.status).toBe(200);
      expect(generateAnswerMock).toHaveBeenCalledOnce();
      const categories = result.body.sources.map((s) => s.category);
      expect(categories.every((c) => c === "Équipements")).toBe(true);
    });
  });

  describe("T4-B : apostrophe droite U+0027 — via regex", () => {

    it("apostrophe droite : hasExhaustiveKeyword=true via regex 'l\u0027ensemble'", async () => {
      // La regex teste normalizedQuestionForExhaustive qui conserve U+0027
      // "l\u0027ensemble" = "l'ensemble" (apostrophe droite)
      const result = await ask("l\u0027ensemble des equipements");

      expect(result.status).toBe(200);
      // hasExhaustiveKeyword=true → documentLimit=10 → branche mono-thème → LLM appelé
      expect(generateAnswerMock).toHaveBeenCalledOnce();
    });

    it("apostrophe droite : sources uniquement équipements (documentLimit=10, pas 5)", async () => {
      const result = await ask("l\u0027ensemble des equipements");

      expect(result.status).toBe(200);
      const categories = result.body.sources.map((s) => s.category);
      expect(categories.every((c) => c === "Équipements")).toBe(true);
      // 3 équipements dans le dataset → 3 sources (slice(0,10) avec boost +50)
      expect(result.body.sources.length).toBe(3);
    });

    it("apostrophe droite vs 'tout' : même nombre de sources (même branche)", async () => {
      const resultTout = await ask("tout l inventaire des equipements");
      vi.clearAllMocks();
      generateAnswerMock.mockResolvedValue({
        answer: "Réponse simulée par le mock LLM.",
        truncated: false,
      });
      findMock.mockReturnValue({
        select: () => ({ lean: async () => DEFAULT_DATASET }),
      });
      const resultEnsemble = await ask("l\u0027ensemble des equipements");

      expect(resultTout.body.sources.length).toBe(resultEnsemble.body.sources.length);
    });
  });

  describe("T4-C : apostrophe typographique U+2019 — comportement réel (V8)", () => {

    // CONSTAT VÉRIFIÉ : en V8 (Node.js / Vitest), la regex /\b(l'ensemble)\b/ avec
    // U+0027 dans le pattern matche AUSSI une chaîne contenant U+2019.
    // La divergence anticipée dans l'audit (U+2019 → hasExhaustiveKeyword=false)
    // ne se produit pas en pratique. Les deux apostrophes produisent le même résultat.

    it("apostrophe typographique U+2019 : regex matche, hasExhaustiveKeyword=true", async () => {
      // V8 traite U+2019 comme équivalent à U+0027 dans le contexte de \b(l'ensemble)
      // → hasExhaustiveKeyword=true, documentLimit=10, LLM appelé
      const result = await ask("l\u2019ensemble des equipements");

      expect(result.status).toBe(200);
      expect(generateAnswerMock).toHaveBeenCalledOnce();
    });

    it("apostrophe typographique U+2019 et droite U+0027 : même nombre de sources", async () => {
      // Les deux formulations produisent hasExhaustiveKeyword=true et documentLimit=10
      const resultDroite = await ask("l\u0027ensemble des equipements");
      vi.clearAllMocks();
      generateAnswerMock.mockResolvedValue({
        answer: "Réponse simulée par le mock LLM.",
        truncated: false,
      });
      findMock.mockReturnValue({
        select: () => ({ lean: async () => DEFAULT_DATASET }),
      });
      const resultTypo = await ask("l\u2019ensemble des equipements");

      expect(resultDroite.status).toBe(200);
      expect(resultTypo.status).toBe(200);
      expect(resultDroite.body.sources.length).toBe(resultTypo.body.sources.length);
      expect(resultDroite.body.sources.map((s) => s.slug))
        .toEqual(resultTypo.body.sources.map((s) => s.slug));
    });

    it("apostrophe typographique avec dataset > 5 équipements : documentLimit=10, pas 5", async () => {
      // Vérifie que même avec U+2019, documentLimit=10 (pas 5)
      // Avec 6 équipements, les 6 sources doivent être retournées (≤ 10)
      const sixEquipements = Array.from({ length: 6 }, (_, i) => ({
        slug: `char-t4-eq-0${i + 1}`,
        title: `Fiche équipement T4-0${i + 1}`,
        category: "Équipements",
        content: `T4-0${i + 1} est un équipement fictif de démonstration pour le test T4.`,
        source: "Dataset T4",
        tags: [`T4-0${i + 1}`, "équipement"],
      }));

      findMock.mockReturnValue({
        select: () => ({ lean: async () => sixEquipements }),
      });

      const result = await ask("l\u2019ensemble des equipements");

      expect(result.status).toBe(200);
      // documentLimit=10, boost +50 pour tous les équipements → les 6 passent dans slice(0,10)
      expect(result.body.sources.length).toBe(6);
      expect(generateAnswerMock).toHaveBeenCalledOnce();
    });
  });

  describe("T4-D : 'une vue complete des equipements' — via Set (complete)", () => {

    it("'complete' active hasExhaustiveKeyword=true via Set", async () => {
      const result = await ask("une vue complete des equipements");

      expect(result.status).toBe(200);
      // "complete" ∈ exhaustiveKeywords → hasExhaustiveKeyword=true
      expect(generateAnswerMock).toHaveBeenCalledOnce();
    });

    it("'vue complete' : sources uniquement équipements (documentLimit=10)", async () => {
      const result = await ask("une vue complete des equipements");

      expect(result.status).toBe(200);
      const categories = result.body.sources.map((s) => s.category);
      expect(categories.every((c) => c === "Équipements")).toBe(true);
    });

    it("'vue complete' vs 'tout' : même résultat sur le même dataset", async () => {
      const resultTout = await ask("tout l inventaire des equipements");
      vi.clearAllMocks();
      generateAnswerMock.mockResolvedValue({
        answer: "Réponse simulée par le mock LLM.",
        truncated: false,
      });
      findMock.mockReturnValue({
        select: () => ({ lean: async () => DEFAULT_DATASET }),
      });
      const resultVue = await ask("une vue complete des equipements");

      expect(resultTout.body.sources.map((s) => s.slug))
        .toEqual(resultVue.body.sources.map((s) => s.slug));
    });
  });
});
