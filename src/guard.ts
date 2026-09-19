import { createGateway, experimental_evaluate, gateway } from "ai";
import { DEFAULT_PROFILE, DEFAULT_PROMPT_PROFILE } from "./questions.js";
import {
  extractTextForGuard,
  validateJsonWithSchema
} from "./schema.js";
import {
  DEFAULT_PROMPT_THRESHOLDS,
  DEFAULT_THRESHOLDS,
  type GuardInput,
  type GuardVerdict,
  type JevAnswer,
  type JsonGuardInput,
  type JsonGuardVerdict,
  type PromptGuardInput,
  type PromptGuardVerdict,
  type PromptThresholds,
  type Thresholds
} from "./types.js";
import { evaluateAnswers, evaluatePromptAnswers } from "./verdict.js";

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
  provider?: "gateway" | "typesafe" | "auto" | undefined;
}

export class JevGuard {
  private clientInstance?: SystemOneClient | undefined;
  private readonly defaultThresholds: Thresholds;
  private readonly model: string;
  private readonly apiKey?: string | undefined;
  private readonly provider?: "gateway" | "typesafe" | "auto" | undefined;

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
      this.provider = opts.provider;
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

    // If no client provided, check if direct TypeSafe provider was requested or sk- key is present
    if (
      !this.clientInstance &&
      (this.provider === "typesafe" || (!this.provider && this.apiKey?.startsWith("sk-")))
    ) {
      try {
        const { TypeSafeClient } = await import("@typesafe-ai/sdk");
        const clientOptions: { apiKey?: string } = {};
        if (this.apiKey) {
          clientOptions.apiKey = this.apiKey;
        }
        this.clientInstance = new TypeSafeClient(clientOptions) as unknown as SystemOneClient;
      } catch {
        // Fall through to Vercel AI SDK Gateway if @typesafe-ai/sdk is not available
      }
    }

    // If an injected or direct client was supplied (e.g. for unit testing or direct TypeSafe API), use it
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

  async analyzeJson<T>(input: JsonGuardInput<T>): Promise<JsonGuardVerdict<T>> {
    const validation = validateJsonWithSchema(input.response, input.schema);

    if (!validation.success) {
      const issuesSummary = validation.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join("; ");

      return {
        verdict: "block",
        findings: [
          {
            rule: "schema_validation",
            severity: "block",
            message: "Response failed JSON schema validation.",
            detail: issuesSummary
          }
        ],
        schemaValid: false,
        schemaErrors: validation.errors,
        answers: {},
        usage: { input_tokens: 0, output_tokens: 0 },
        latencyMs: 0
      };
    }

    const textToEvaluate = extractTextForGuard(validation.data, input.targetFields);

    const semanticInput: GuardInput = {
      response: textToEvaluate
    };
    if (input.prompt !== undefined) {
      semanticInput.prompt = input.prompt;
    }
    if (input.model !== undefined) {
      semanticInput.model = input.model;
    }
    if (input.thresholds !== undefined) {
      semanticInput.thresholds = input.thresholds;
    }

    const semanticVerdict = await this.analyze(semanticInput);

    return {
      ...semanticVerdict,
      data: validation.data,
      schemaValid: true
    };
  }

  async analyzePrompt(input: PromptGuardInput): Promise<PromptGuardVerdict> {
    const mergedThresholds: PromptThresholds = {
      ...DEFAULT_PROMPT_THRESHOLDS,
      ...(input.thresholds ?? {})
    };

    const startedAt = performance.now();

    // Check if direct TypeSafe provider should be loaded
    if (
      !this.clientInstance &&
      (this.provider === "typesafe" || (!this.provider && this.apiKey?.startsWith("sk-")))
    ) {
      try {
        const { TypeSafeClient } = await import("@typesafe-ai/sdk");
        const clientOptions: { apiKey?: string } = {};
        if (this.apiKey) {
          clientOptions.apiKey = this.apiKey;
        }
        this.clientInstance = new TypeSafeClient(clientOptions) as unknown as SystemOneClient;
      } catch {
        // Fall through to gateway
      }
    }

    if (this.clientInstance) {
      const request: {
        state: { response: string };
        questions: readonly unknown[];
        model?: string;
      } = {
        state: { response: input.prompt },
        questions: DEFAULT_PROMPT_PROFILE
      };
      if (input.model !== undefined) {
        request.model = input.model;
      }

      const result = await this.clientInstance.systemOne(request);
      const elapsed = performance.now() - startedAt;
      const latencyMs = Math.round(elapsed * 100) / 100;

      const { findings, verdict } = evaluatePromptAnswers(
        result.answers as unknown as Parameters<typeof evaluatePromptAnswers>[0],
        mergedThresholds
      );

      return {
        verdict,
        findings,
        answers: result.answers as unknown as PromptGuardVerdict["answers"],
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
      prompt_injection: {
        type: "boolean" as const,
        instructions: DEFAULT_PROMPT_PROFILE[0]!.instructions
      },
      jailbreak_intent: {
        type: "boolean" as const,
        instructions: DEFAULT_PROMPT_PROFILE[1]!.instructions
      },
      harm_intent: {
        type: "score" as const,
        instructions: DEFAULT_PROMPT_PROFILE[2]!.instructions,
        criteria: [
          "Benign, safe, constructive request.",
          "Potentially sensitive or dual-use request requiring care.",
          "Directly harmful, malicious, or illicit request."
        ]
      }
    };

    const res = await (experimental_evaluate as any)({
      model: (gw as any).evaluation(modelName),
      state: input.prompt,
      questions: evalQuestions
    });

    const elapsed = performance.now() - startedAt;
    const latencyMs = Math.round(elapsed * 100) / 100;

    const answers: Record<string, JevAnswer> = {
      prompt_injection: {
        type: "noul",
        noul:
          typeof res.answers?.prompt_injection?.probability === "number"
            ? res.answers.prompt_injection.probability
            : res.answers?.prompt_injection?.value
            ? 1
            : 0
      },
      jailbreak_intent: {
        type: "noul",
        noul:
          typeof res.answers?.jailbreak_intent?.probability === "number"
            ? res.answers.jailbreak_intent.probability
            : res.answers?.jailbreak_intent?.value
            ? 1
            : 0
      },
      harm_intent: {
        type: "score",
        score: res.answers?.harm_intent?.score ?? 0,
        confidence: res.answers?.harm_intent?.confidence ?? 0.95
      }
    };

    const { findings, verdict } = evaluatePromptAnswers(answers, mergedThresholds);

    return {
      verdict,
      findings,
      answers: answers as PromptGuardVerdict["answers"],
      usage: {
        input_tokens: res.usage?.inputTokens ?? 0,
        output_tokens: res.usage?.outputTokens ?? 0
      },
      latencyMs
    };
  }
}
