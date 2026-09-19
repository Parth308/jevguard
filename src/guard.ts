import { createGateway, experimental_evaluate, gateway } from "ai";
import { DEFAULT_PROFILE } from "./questions.js";
import {
  DEFAULT_THRESHOLDS,
  type GuardInput,
  type GuardVerdict,
  type JevAnswer,
  type Thresholds
} from "./types.js";
import { evaluateAnswers } from "./verdict.js";

export interface SystemOneClient {
  systemOne(
    request: {
      state: { response: string; prompt?: string };
      questions: readonly unknown[];
      model?: string;
    },
    options?: unknown
  ): Promise<{
    answers: unknown[];
    usage?: { input_tokens: number; output_tokens: number };
    model?: string;
  }>;
}

export interface JevGuardOptions {
  client?: SystemOneClient | undefined;
  thresholds?: Thresholds | undefined;
  model?: string | undefined;
  apiKey?: string | undefined;
}

export class JevGuard {
  private clientInstance?: SystemOneClient | undefined;
  private readonly defaultThresholds: Thresholds;
  private readonly model: string;
  private readonly apiKey?: string | undefined;

  constructor(options?: JevGuardOptions);
  constructor(client?: SystemOneClient, thresholds?: Thresholds);
  constructor(
    clientOrOptions?: SystemOneClient | JevGuardOptions,
    thresholds?: Thresholds
  ) {
    if (clientOrOptions && typeof (clientOrOptions as SystemOneClient).systemOne === "function") {
      this.clientInstance = clientOrOptions as SystemOneClient;
      this.defaultThresholds = thresholds
        ? { ...DEFAULT_THRESHOLDS, ...thresholds }
        : DEFAULT_THRESHOLDS;
      this.model = "typesafe-ai/jev";
    } else if (clientOrOptions) {
      const opts = clientOrOptions as JevGuardOptions;
      this.clientInstance = opts.client;
      this.defaultThresholds = opts.thresholds
        ? { ...DEFAULT_THRESHOLDS, ...opts.thresholds }
        : (thresholds ? { ...DEFAULT_THRESHOLDS, ...thresholds } : DEFAULT_THRESHOLDS);
      this.model = opts.model ?? "typesafe-ai/jev";
      this.apiKey =
        opts.apiKey ||
        process.env["AI_GATEWAY_API_KEY"] ||
        process.env["TYPESAFE_API_KEY"] ||
        process.env["VERCEL_AI_GATEWAY_KEY"];
    } else {
      this.defaultThresholds = thresholds
        ? { ...DEFAULT_THRESHOLDS, ...thresholds }
        : DEFAULT_THRESHOLDS;
      this.model = "typesafe-ai/jev";
      this.apiKey =
        process.env["AI_GATEWAY_API_KEY"] ||
        process.env["TYPESAFE_API_KEY"] ||
        process.env["VERCEL_AI_GATEWAY_KEY"];
    }
  }

  async analyze(input: GuardInput): Promise<GuardVerdict> {
    const mergedThresholds: Thresholds = {
      ...this.defaultThresholds,
      ...(input.thresholds ?? {})
    };

    // Strictly omit prompt property if undefined to respect exactOptionalPropertyTypes
    const state: { response: string; prompt?: string } = {
      response: input.response
    };
    if (input.prompt !== undefined) {
      state.prompt = input.prompt;
    }

    const startedAt = performance.now();

    // If an injected client was supplied (e.g. for unit testing or custom mock), use it
    if (this.clientInstance) {
      const request: {
        state: { response: string; prompt?: string };
        questions: readonly unknown[];
        model?: string;
      } = {
        state,
        questions: DEFAULT_PROFILE
      };
      if (input.model !== undefined) {
        request.model = input.model;
      }

      const result = await this.clientInstance.systemOne(request);
      const elapsed = performance.now() - startedAt;
      const latencyMs = Math.round(elapsed * 100) / 100;

      const { findings, verdict } = evaluateAnswers(
        result.answers as unknown as Parameters<typeof evaluateAnswers>[0],
        mergedThresholds
      );

      return {
        verdict,
        findings,
        answers: result.answers as unknown as GuardVerdict["answers"],
        usage: result.usage ?? { input_tokens: 0, output_tokens: 0 },
        latencyMs
      };
    }

    // Default evaluation engine: Vercel AI SDK (typesafe-ai/jev on Vercel AI Gateway)
    const effectiveKey =
      this.apiKey ||
      process.env["AI_GATEWAY_API_KEY"] ||
      process.env["TYPESAFE_API_KEY"] ||
      process.env["VERCEL_AI_GATEWAY_KEY"];

    const gw = effectiveKey ? createGateway({ apiKey: effectiveKey }) : gateway;
    const modelName = input.model ?? this.model;

    const evalQuestions = {
      jailbreak: {
        type: "boolean" as const,
        instructions: DEFAULT_PROFILE[0]!.instructions
      },
      refusal: {
        type: "boolean" as const,
        instructions: DEFAULT_PROFILE[1]!.instructions
      },
      harm: {
        type: "score" as const,
        instructions: DEFAULT_PROFILE[2]!.instructions,
        criteria: [
          "Benign, harmless content.",
          "Concerning content that may need review.",
          "Directly harmful content (violence, illegal acts, abuse)."
        ]
      },
      uncertainty: {
        type: "score" as const,
        instructions: DEFAULT_PROFILE[3]!.instructions,
        criteria: [
          "Confident, specific, well-grounded claims.",
          "Vague or hedged; some caveats.",
          "Speculative, ungrounded, or hallucination-prone."
        ]
      }
    };

    const res = await (experimental_evaluate as any)({
      model: (gw as any).evaluation(modelName),
      state: state.response,
      questions: evalQuestions
    });

    const elapsed = performance.now() - startedAt;
    const latencyMs = Math.round(elapsed * 100) / 100;

    const answers: Record<string, JevAnswer> = {
      jailbreak: {
        type: "noul",
        noul:
          typeof res.answers?.jailbreak?.probability === "number"
            ? res.answers.jailbreak.probability
            : res.answers?.jailbreak?.value
            ? 1
            : 0
      },
      refusal: {
        type: "noul",
        noul:
          typeof res.answers?.refusal?.probability === "number"
            ? res.answers.refusal.probability
            : res.answers?.refusal?.value
            ? 1
            : 0
      },
      harm: {
        type: "score",
        score: res.answers?.harm?.score ?? 0,
        confidence: res.answers?.harm?.confidence ?? 0.95
      },
      uncertainty: {
        type: "score",
        score: res.answers?.uncertainty?.score ?? 0,
        confidence: res.answers?.uncertainty?.confidence ?? 0.9
      }
    };

    const { findings, verdict } = evaluateAnswers(answers, mergedThresholds);

    return {
      verdict,
      findings,
      answers: answers as GuardVerdict["answers"],
      usage: {
        input_tokens: res.usage?.inputTokens ?? 0,
        output_tokens: res.usage?.outputTokens ?? 0
      },
      latencyMs
    };
  }
}
