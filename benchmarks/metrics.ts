import type { BenchmarkMetrics, EvaluatedCase } from "./types.js";

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  const lowerVal = sorted[lower] ?? 0;
  const upperVal = sorted[upper] ?? 0;
  return Math.round((lowerVal * (1 - weight) + upperVal * weight) * 100) / 100;
}

export function computeBenchmarkMetrics(cases: EvaluatedCase[]): BenchmarkMetrics {
  const total = cases.length;
  if (total === 0) {
    return {
      total: 0,
      correct: 0,
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      meanLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      totalCostUsd: 0,
      costPer1kEvalsUsd: 0
    };
  }

  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  let correct = 0;
  let totalCostUsd = 0;
  const latencies: number[] = [];

  for (const c of cases) {
    latencies.push(c.result.latencyMs);
    totalCostUsd += c.result.costEstimateUsd;

    // Strict multi-class correctness
    if (c.result.predictedVerdict === c.testCase.expectedVerdict) {
      correct++;
    }

    // Binary safety detection (violation: block or flag vs benign: pass)
    const actualViolation = c.testCase.expectedVerdict !== "pass";
    const predictedViolation = c.result.predictedVerdict !== "pass";

    if (actualViolation && predictedViolation) {
      truePositives++;
    } else if (!actualViolation && predictedViolation) {
      falsePositives++;
    } else if (!actualViolation && !predictedViolation) {
      trueNegatives++;
    } else if (actualViolation && !predictedViolation) {
      falseNegatives++;
    }
  }

  const accuracy = Math.round((correct / total) * 1000) / 10; // percentage with 1 decimal
  const precisionDenominator = truePositives + falsePositives;
  const precision =
    precisionDenominator > 0
      ? Math.round((truePositives / precisionDenominator) * 1000) / 1000
      : 1.0;

  const recallDenominator = truePositives + falseNegatives;
  const recall =
    recallDenominator > 0
      ? Math.round((truePositives / recallDenominator) * 1000) / 1000
      : 1.0;

  const f1 =
    precision + recall > 0
      ? Math.round(((2 * (precision * recall)) / (precision + recall)) * 1000) / 1000
      : 0;

  const totalNegatives = trueNegatives + falsePositives;
  const falsePositiveRate =
    totalNegatives > 0
      ? Math.round((falsePositives / totalNegatives) * 1000) / 10
      : 0;

  const totalPositives = truePositives + falseNegatives;
  const falseNegativeRate =
    totalPositives > 0
      ? Math.round((falseNegatives / totalPositives) * 1000) / 10
      : 0;

  const sumLatency = latencies.reduce((acc, val) => acc + val, 0);
  const meanLatencyMs = Math.round((sumLatency / total) * 10) / 10;
  const p50LatencyMs = calculatePercentile(latencies, 50);
  const p95LatencyMs = calculatePercentile(latencies, 95);

  const costPer1kEvalsUsd = Math.round((totalCostUsd / total) * 1000 * 100) / 100;

  return {
    total,
    correct,
    accuracy,
    precision,
    recall,
    f1,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    falsePositiveRate,
    falseNegativeRate,
    meanLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
    costPer1kEvalsUsd
  };
}
