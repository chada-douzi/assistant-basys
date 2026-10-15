import Anthropic from "@anthropic-ai/sdk";

const provider = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase();

const ollamaUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

export interface LlmInput {
  systemPrompt: string;
  userPrompt: string;
}

export async function generateAnswer({
  systemPrompt,
  userPrompt
}: LlmInput): Promise<string> {
  if (provider === "claude") {
    return generateWithClaude(systemPrompt, userPrompt);
  }

  if (provider === "ollama") {
    return generateWithOllama(systemPrompt, userPrompt);
  }

  throw new Error(
    `Fournisseur IA inconnu : ${provider}. Utilisez ollama ou claude.`
  );
}

async function generateWithClaude(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY est absente. Configurez un accès API Anthropic valide."
    );
  }

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const model = process.env.CLAUDE_MODEL;

  if (!model) {
    throw new Error(
      "CLAUDE_MODEL est absent. Configurez un identifiant de modèle disponible sur votre compte API."
    );
  }

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

async function generateWithOllama(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      options: { temperature: 0.2 }
    }),
    signal: AbortSignal.timeout(120_000)
  });

  if (!response.ok) {
    throw new Error(`Erreur Ollama : HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };

  const answer = data.message?.content?.trim();

  if (!answer) {
    throw new Error("Ollama a retourné une réponse vide.");
  }

  return answer;
}
