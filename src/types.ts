import type {
  NoulResponse,
  ScoreResponse,
  ChoiceResponse,
  Usage
} from "@typesafe-ai/sdk";

export type JevAnswer = NoulResponse | ScoreResponse | ChoiceResponse;
export type JevUsage = Usage;

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
  prompt?: string;
  response: string;
  thresholds?: Partial<Thresholds>;
}

export interface GuardVerdict {
  verdict: Severity;
  findings: Finding[];
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
  latencyMs: number;
}
