export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend?: Record<number, string> | undefined;
  probabilities?: Record<number, number> | undefined;
}

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
}

export type JevAnswer = JevNoulAnswer | JevScoreAnswer | JevChoiceAnswer;

export type Severity = "block" | "flag" | "pass";

export interface Thresholds {
  jailbreakBlock: number;   // noul ratio above this => block
  refusalBlock: number;     // noul ratio above this => block
  harmBlock: number;        // harm score >= this => block
  harmFlag: number;         // harm score >= this (and confident) => flag
  uncertaintyFlag: number;  // uncertainty score >= this (and confident) => flag
  minConfidence: number;    // min score confidence for flag-level findings
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  jailbreakBlock: 0.5,
  refusalBlock: 0.5,
  harmBlock: 1.5,
  harmFlag: 0.8,
  uncertaintyFlag: 0.8,
  minConfidence: 0.5
};

export interface PromptThresholds {
  injectionBlock: number; // noul ratio above this => block
  jailbreakBlock: number; // noul ratio above this => block
  harmBlock: number;      // harm score >= this => block
  harmFlag: number;       // harm score >= this (and confident) => flag
  minConfidence: number;  // min score confidence for flag-level findings
}

export const DEFAULT_PROMPT_THRESHOLDS: PromptThresholds = {
  injectionBlock: 0.5,
  jailbreakBlock: 0.5,
  harmBlock: 1.5,
  harmFlag: 0.8,
  minConfidence: 0.5
};

export function severityRank(severity: Severity): number {
  switch (severity) {
    case "block":
      return 3;
    case "flag":
      return 2;
    case "pass":
      return 1;
  }
}

export interface Finding {
  rule: string;
  severity: "block" | "flag";
  message: string;
  detail: string;
}

export interface GuardInput {
  prompt?: string | undefined;
  response: string;
  model?: string | undefined;
  thresholds?: Partial<Thresholds> | undefined;
}

export interface GuardVerdict {
  verdict: Severity;
  findings: Finding[];
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
  latencyMs: number;
}

export interface PromptGuardInput {
  prompt: string;
  model?: string | undefined;
  thresholds?: Partial<PromptThresholds> | undefined;
}

export interface PromptGuardVerdict {
  verdict: Severity;
  findings: Finding[];
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
  latencyMs: number;
}

export interface SchemaErrorDetail {
  path: string;
  message: string;
}

export type ZodSafeParseSuccess<T> = { success: true; data: T };
export type ZodSafeParseError = {
  success: false;
  error: {
    issues?: Array<{ path?: readonly unknown[] | undefined; message?: string | undefined }> | undefined;
    errors?: Array<{ path?: readonly unknown[] | undefined; message?: string | undefined }> | undefined;
    message?: string | undefined;
  };
};

export type ZodSafeParseResult<T> = ZodSafeParseSuccess<T> | ZodSafeParseError;

export interface ZodTypeLike<T> {
  safeParse(data: unknown): ZodSafeParseResult<T>;
}

export interface JsonGuardInput<T> extends GuardInput {
  schema: ZodTypeLike<T>;
  targetFields?: Array<keyof T | string> | undefined;
}

export interface JsonGuardVerdict<T> extends GuardVerdict {
  data?: T | undefined;
  schemaValid: boolean;
  schemaErrors?: SchemaErrorDetail[] | undefined;
}
