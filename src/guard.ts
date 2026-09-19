import { TypeSafeClient } from "@typesafe-ai/sdk";
import type {
  Questions,
  RequestOptions,
  SystemOneRequest,
  SystemOneResult
} from "@typesafe-ai/sdk";
import { DEFAULT_PROFILE } from "./questions.js";
import {
  DEFAULT_THRESHOLDS,
  type GuardInput,
  type GuardVerdict,
  type Thresholds
} from "./types.js";
import { evaluateAnswers } from "./verdict.js";

export interface SystemOneClient {
  systemOne<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions
  ): Promise<SystemOneResult<Q>>;
}

export class JevGuard {
  private clientInstance: SystemOneClient | undefined;
  private readonly defaultThresholds: Thresholds;

  constructor(client?: SystemOneClient, thresholds?: Thresholds) {
    this.clientInstance = client;
    this.defaultThresholds = thresholds
      ? { ...DEFAULT_THRESHOLDS, ...thresholds }
      : DEFAULT_THRESHOLDS;
  }

  private getClient(): SystemOneClient {
    if (!this.clientInstance) {
      this.clientInstance = new TypeSafeClient();
    }
    return this.clientInstance;
  }

  async analyze(input: GuardInput): Promise<GuardVerdict> {
    const mergedThresholds: Thresholds = {
      ...this.defaultThresholds,
      ...(input.thresholds ?? {})
    };

    const client = this.getClient();

    // Strictly omit prompt property if undefined to respect exactOptionalPropertyTypes
    const state: { response: string; prompt?: string } = {
      response: input.response
    };
    if (input.prompt !== undefined) {
      state.prompt = input.prompt;
    }

    const startedAt = performance.now();

    const request: {
      state: { response: string; prompt?: string };
      questions: Questions;
      model?: string;
    } = {
      state,
      questions: DEFAULT_PROFILE as unknown as Questions
    };
    if (input.model !== undefined) {
      request.model = input.model;
    }

    const result = await client.systemOne(request as any);

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
      usage: result.usage,
      latencyMs
    };
  }
}
