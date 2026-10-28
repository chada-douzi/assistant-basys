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

const equipment001 = {
  slug: "eq-001",
  title: "Fiche équipement — Pompe industrielle",
  category: "Équipements",
  content:
    "EQ-001 est une pompe industrielle située dans l'atelier A. L'état simulé est en service. La dernière maintenance est datée du 2026-09-15. Exemple fictif.",
  source: "Demo",
  tags: ["EQ-001"],
};

const equipment005 = {
  slug: "eq-005",
  title: "Fiche équipement — Ventilateur",
  category: "Équipements",
  content:
    "EQ-005 est un ventilateur situé dans la zone B. L'état simulé est disponible. Exemple fictif.",
  source: "Demo",
  tags: ["EQ-005"],
};

const maintenanceDoc = {
  slug: "maintenance-preventive",
  title: "Objectif de la maintenance préventive",
  category: "Maintenance",
  content:
    "La maintenance préventive vise à réduire les pannes et à maintenir les équipements en bon état. Exemple fictif.",
  source: "Demo",
  tags: ["maintenance", "préventive"],
};

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
    throw new Error("Impossible de déterminer le port du serveur de test.");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

beforeEach(() => {
  vi.clearAllMocks();

  findMock.mockReturnValue({
    select: () => ({
      lean: async () => [equipment001, equipment005, maintenanceDoc],
    }),
  });

  generateAnswerMock.mockResolvedValue({
    answer: "La maintenance préventive permet de réduire les pannes.",
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
    body: await response.json(),
  };
}

describe("Comportement de l'assistant BaSYS", () => {
  it("refuse d'inventer les informations d'un équipement inconnu", async () => {
    const result = await ask("Quel est le statut de EQ-999 ?");

    expect(result.status).toBe(200);
    expect(result.body.answer).toMatch(/pas trouvé|aucune information|reformule/i);
    expect(result.body.sources).toHaveLength(0);
    expect(generateAnswerMock).not.toHaveBeenCalled();
  });

  it("retourne le statut et la date exacts de EQ-001", async () => {
    const result = await ask("Quel est le statut de EQ-001 ?");

    expect(result.status).toBe(200);
    expect(result.body.answer).toContain("EQ-001");
    expect(result.body.answer).toContain("en service");
    expect(result.body.answer).toContain("2026-09-15");
    expect(generateAnswerMock).not.toHaveBeenCalled();
  });

  it("compare correctement EQ-001 et EQ-005", async () => {
    const result = await ask("Compare le statut de EQ-001 et EQ-005.");

    expect(result.status).toBe(200);
    expect(result.body.answer).toContain("EQ-001");
    expect(result.body.answer).toContain("en service");
    expect(result.body.answer).toContain("EQ-005");
    expect(result.body.answer).toContain("disponible");
    expect(generateAnswerMock).not.toHaveBeenCalled();
  });

  it("utilise le modèle pour une question générale sur la maintenance", async () => {
    const result = await ask(
      "Quel est l'objectif de la maintenance preventive ?"
    );

    expect(result.status).toBe(200);
    expect(generateAnswerMock).toHaveBeenCalledOnce();
    expect(result.body.answer).toContain(
      "La maintenance préventive permet de réduire les pannes."
    );
  });
  it("ne privilégie pas les documents secondaires pour une question ciblée", async () => {
    const secondaryMaintenanceDocs = [
      {
        slug: "maintenance-historique",
        title: "Consulter l'historique de maintenance",
        category: "Maintenance",
        content: "Consulter les interventions passées et leurs dates.",
        source: "Demo",
        tags: ["historique", "interventions"],
      },
      {
        slug: "maintenance-statut",
        title: "Comprendre les statuts de maintenance",
        category: "Maintenance",
        content: "Les statuts indiquent l'avancement d'une intervention.",
        source: "Demo",
        tags: ["statut", "intervention"],
      },
      {
        slug: "maintenance-planning",
        title: "Consulter le planning de maintenance",
        category: "Maintenance",
        content: "Le planning présente les interventions programmées.",
        source: "Demo",
        tags: ["planning", "intervention"],
      },
      {
        slug: "maintenance-absence",
        title: "Traiter une information de maintenance absente",
        category: "Maintenance",
        content: "Vérifier les informations manquantes d'une intervention.",
        source: "Demo",
        tags: ["information", "intervention"],
      },
    ];

    findMock.mockReturnValue({
      select: () => ({
        lean: async () => [
          equipment001,
          equipment005,
          maintenanceDoc,
          ...secondaryMaintenanceDocs,
        ],
      }),
    });

    const result = await ask(
      "Quel est l'objectif de la maintenance preventive ?"
    );

    expect(result.status).toBe(200);
    expect(result.body.sources[0].slug).toBe("maintenance-preventive");
    expect(result.body.sources.map((source: { slug: string }) => source.slug))
      .toEqual(["maintenance-preventive"]);
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });
  it("retourne la source directement pertinente pour une question ciblée", async () => {
    const result = await ask(
      "Quel est l'objectif de la maintenance preventive ?"
    );

    expect(result.status).toBe(200);
    expect(result.body.sources).toHaveLength(1);
    expect(result.body.sources[0].slug).toBe("maintenance-preventive");
    expect(result.body.sources[0].title).toBe(
      "Objectif de la maintenance préventive"
    );
    expect(generateAnswerMock).toHaveBeenCalledOnce();
  });
});
