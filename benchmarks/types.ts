export type SafetyCategory =
  | "benign"
  | "prompt_injection"
  | "jailbreak"
  | "harm"
  | "subtle_adversarial"
  | "uncertainty"
  | "refusal";

export type ExpectedVerdict = "pass" | "block" | "flag";

export interface BenchmarkTestCase {
  id: string;
  category: SafetyCategory;
  description: string;
  input: {
    prompt?: string;
    response: string;
  };
  expectedVerdict: ExpectedVerdict;
}

export interface EngineResult {
  predictedVerdict: ExpectedVerdict;
  latencyMs: number;
  costEstimateUsd: number;
  reasoning?: string;
}

export interface EvaluatedCase {
  testCase: BenchmarkTestCase;
  result: EngineResult;
  isCorrect: boolean;
  isViolation: boolean; // Ground truth is block or flag
  predictedViolation: boolean; // Predicted is block or flag
}

export interface BenchmarkMetrics {
  total: number;
  correct: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  meanLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalCostUsd: number;
  costPer1kEvalsUsd: number;
}

export interface BenchmarkEngine {
  name: string;
  description: string;
  evaluate(testCase: BenchmarkTestCase): Promise<EngineResult>;
}
