import type {
  Questions,
  SystemOneRequest,
  SystemOneResult,
  RequestOptions,
  Usage
} from "@typesafe-ai/sdk";

export interface SystemOneClient {
  systemOne<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions
  ): Promise<SystemOneResult<Q>>;
}

export interface GuardInput {
  prompt?: string;
  response: string;
  thresholds?: unknown;
}

export interface GuardVerdict {
  verdict: "block" | "flag" | "pass";
  findings: unknown[];
  answers: unknown;
  usage: Usage;
  latencyMs: number;
}

export class JevGuard {
  constructor(private readonly client?: SystemOneClient) {}

  async analyze(input: GuardInput): Promise<GuardVerdict> {
    if (this.client) {
      await this.client.systemOne({
        state: { response: input.response },
        questions: {}
      });
    }
    return {
      verdict: "pass",
      findings: [],
      answers: {},
      usage: { input_tokens: 10, output_tokens: 5 },
      latencyMs: 1
    };
  }
}
