import Anthropic from "@anthropic-ai/sdk";

const provider = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase();

const ollamaUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

export interface LlmInput {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Résultat d'une génération LLM.
 * `truncated` est `true` si le modèle s'est arrêté avant la fin naturelle
 * de sa réponse (limite de tokens atteinte, done_reason = "length").
 */
export interface LlmResult {
  answer: string;
  truncated: boolean;
}

export async function generateAnswer({
  systemPrompt,
  userPrompt
}: LlmInput): Promise<LlmResult> {
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
): Promise<LlmResult> {
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

  const answer = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  // Claude indique la troncature via stop_reason === "max_tokens"
  const truncated = response.stop_reason === "max_tokens";

  return { answer, truncated };
}

async function generateWithOllama(
  systemPrompt: string,
  userPrompt: string
): Promise<LlmResult> {
  const startTime = performance.now();

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
	keep_alive: "10m",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        options: {
          temperature: 0.2,
          num_predict: 512,
	}
      }),
      signal: AbortSignal.timeout(120_000)
    });

    if (!response.ok) {
      const fetchDuration = performance.now() - startTime;
      console.log(JSON.stringify({
        component: "ollama",
        model: ollamaModel,
        error: true,
        httpStatus: response.status,
        performance: {
          fetchTotal_ms: Number(fetchDuration.toFixed(2))
        }
      }));
      throw new Error(`Erreur Ollama : HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      total_duration?: number;
      load_duration?: number;
      prompt_eval_count?: number;
      prompt_eval_duration?: number;
      eval_count?: number;
      eval_duration?: number;
      done_reason?: string;
    };

    const fetchDuration = performance.now() - startTime;

    // Log détaillé Ollama (stats natives)
    console.log(JSON.stringify({
      component: "ollama",
      model: ollamaModel,
      performance: {
        fetchTotal_ms: Number(fetchDuration.toFixed(2)),
        totalDuration_ms: data.total_duration ? Number((data.total_duration / 1_000_000).toFixed(2)) : null,
        loadDuration_ms: data.load_duration ? Number((data.load_duration / 1_000_000).toFixed(2)) : null,
        promptEvalDuration_ms: data.prompt_eval_duration ? Number((data.prompt_eval_duration / 1_000_000).toFixed(2)) : null,
        evalDuration_ms: data.eval_duration ? Number((data.eval_duration / 1_000_000).toFixed(2)) : null
      },
      tokens: {
        promptEvalCount: data.prompt_eval_count ?? null,
        evalCount: data.eval_count ?? null,
        doneReason: data.done_reason ?? null
      },
      prompts: {
        systemLength: systemPrompt.length,
        userLength: userPrompt.length
      }
    }));

    // Avertissement explicite si la génération a été tronquée par la limite de tokens.
    // La réponse sera incomplète — le client ne le sait pas autrement.
    const truncated = data.done_reason === "length";
    if (truncated) {
      console.warn(JSON.stringify({
        component: "ollama",
        warning: "generation_truncated",
        message: "La réponse Ollama a été tronquée : num_predict atteint avant la fin de la génération.",
        evalCount: data.eval_count ?? null,
        promptTokens: data.prompt_eval_count ?? null,
        contextChars: systemPrompt.length + userPrompt.length
      }));
    }

    const answer = data.message?.content?.trim();

    if (!answer) {
      throw new Error("Ollama a retourné une réponse vide.");
    }

    return { answer, truncated };
  } catch (error) {
    // Si le log de succès n'a pas été effectué, logger l'erreur avec durée
    const fetchDuration = performance.now() - startTime;
    if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('fetch'))) {
      console.log(JSON.stringify({
        component: "ollama",
        model: ollamaModel,
        error: true,
        errorType: error.name,
        performance: {
          fetchTotal_ms: Number(fetchDuration.toFixed(2))
        }
      }));
    }
    throw error;
  }
}
