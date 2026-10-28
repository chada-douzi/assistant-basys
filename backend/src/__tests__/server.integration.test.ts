import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

const { findMock, findOneMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
  findOneMock: vi.fn(),
}));

vi.mock("../models/KnowledgeDocument.js", () => ({
  KnowledgeDocument: {
    find: findMock,
    findOne: findOneMock,
  },
}));

vi.mock("../services/llm.js", () => ({
  generateAnswer: vi.fn(),
}));

import { app } from "../server.js";

describe("Tests HTTP de l'API", () => {
  let server: Server;
  let baseUrl: string;

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
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();

    findMock.mockReturnValue({
      select: () => ({
        lean: async () => [],
      }),
    });

    findOneMock.mockReturnValue({
      select: () => ({
        lean: async () => null,
      }),
    });
  });

  it("GET /api/health retourne un statut OK", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json() as { status: string; service: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("assistant-basys-api");
  });

  it("POST /api/chat refuse une question trop courte", async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "x" }),
    });

    expect(response.status).toBe(400);
  });

  it("POST /api/chat refuse une question de plus de 1000 caractères", async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "a".repeat(1001) }),
    });

    expect(response.status).toBe(400);
  });

  it("GET sur une route inconnue retourne du JSON", async () => {
    const response = await fetch(`${baseUrl}/api/route-inconnue`);
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.json() as { error: string };

    expect(response.status).toBe(404);
    expect(contentType).toContain("application/json");
    expect(body.error).toBe("Route introuvable.");
  });

  it("POST avec un JSON mal formé retourne une erreur JSON sans pile technique", async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"question":',
    });

    const contentType = response.headers.get("content-type") ?? "";
    const rawBody = await response.text();
    const body = JSON.parse(rawBody) as { error: string };

    expect(response.status).toBe(400);
    expect(contentType).toContain("application/json");
    expect(body.error).toBe("Corps JSON invalide.");
    expect(rawBody).not.toContain("node_modules");
    expect(rawBody).not.toContain("SyntaxError:");
  });

  it("GET /api/knowledge refuse une requête trop courte", async () => {
    const response = await fetch(`${baseUrl}/api/knowledge?q=a`);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/au moins 2/);
  });

  it("GET /api/knowledge refuse une requête trop longue", async () => {
    const q = "a".repeat(101);
    const response = await fetch(
      `${baseUrl}/api/knowledge?q=${encodeURIComponent(q)}`
    );
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/dépasser 100/);
  });

  it("GET /api/knowledge retourne un tableau de résultats JSON", async () => {
    const response = await fetch(`${baseUrl}/api/knowledge?q=ok`);
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.json() as {
      query?: string;
      count?: number;
      results?: unknown[];
    };

    expect(response.status).toBe(200);
    expect(contentType).toContain("application/json");
    expect(body).toHaveProperty("query");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.results)).toBe(true);
  });

  it("GET /api/knowledge/:slug retourne 404 pour un slug inexistant", async () => {
    const response = await fetch(
      `${baseUrl}/api/knowledge/slug-inexistant-xyz`
    );
    const body = await response.json() as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("Document introuvable.");
  });

  it("GET /api/knowledge/:slug refuse un slug invalide (trop long)", async () => {
    const longSlug = "a".repeat(201);
    const response = await fetch(`${baseUrl}/api/knowledge/${longSlug}`);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalide/);
  });
});
