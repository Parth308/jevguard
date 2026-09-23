import fs from "node:fs";
import path from "node:path";
import { LayaEngine } from "./engines/laya-engine.js";
import { computeBenchmarkMetrics } from "./metrics.js";
import type { BenchmarkTestCase, EvaluatedCase } from "./types.js";

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match?.[1] && match[2]) {
      const varName = match[1];
      const val = match[2].replace(/^["']|["']$/g, "");
      if (!process.env[varName]) process.env[varName] = val;
    }
  }
}

async function main() {
  loadEnv();
  const baseUrl = process.env["LAYA_BASE_URL"] ?? "http://127.0.0.1:8000";

  // Verify server is reachable before trusting live results
  try {
    const health = await fetch(`${baseUrl}/health`);
    const body = (await health.json()) as { status?: string; device?: string; model?: string };
    console.log(`Laya server: ${health.status} ${JSON.stringify(body)}\n`);
  } catch (err) {
    console.error(`FATAL: Laya server not reachable at ${baseUrl}.`, err);
    process.exit(1);
  }

  const dataset: BenchmarkTestCase[] = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "benchmarks/dataset.json"), "utf-8")
  );

  const engine = new LayaEngine({ mode: "live", baseUrl });
  console.log(`Engine: ${engine.name}`);
  console.log(`isLive: ${engine.isLive}`);
  console.log(`Cases: ${dataset.length}\n`);

  const cases: EvaluatedCase[] = [];
  const verdictCounts: Record<string, number> = { pass: 0, flag: 0, block: 0 };
  const mismatches: string[] = [];

  for (let i = 0; i < dataset.length; i++) {
    const tc = dataset[i]!;
    const result = await engine.evaluate(tc);
    const isCorrect = result.predictedVerdict === tc.expectedVerdict;
    verdictCounts[result.predictedVerdict] = (verdictCounts[result.predictedVerdict] ?? 0) + 1;

    if (!isCorrect && mismatches.length < 15) {
      const snippet = (tc.input.response ?? "").slice(0, 60).replace(/\s+/g, " ");
      mismatches.push(
        `  [${tc.id}] ${tc.category} expected=${tc.expectedVerdict} got=${result.predictedVerdict} | ${snippet}`
      );
    }

    cases.push({
      testCase: tc,
      result,
      isCorrect,
      isViolation: tc.expectedVerdict !== "pass",
      predictedViolation: result.predictedVerdict !== "pass"
    });

    if ((i + 1) % 20 === 0) console.log(`  ... ${i + 1}/${dataset.length}`);
  }

  const metrics = computeBenchmarkMetrics(cases);

  console.log("\n=== Laya Live Re-Benchmark Results ===");
  console.log(JSON.stringify(metrics, null, 2));
  console.log("\nVerdict distribution:", verdictCounts);
  console.log(`Accuracy: ${metrics.correct}/${metrics.total} (${metrics.accuracy}%)`);
  console.log(`F1: ${metrics.f1} | Precision: ${metrics.precision} | Recall: ${metrics.recall}`);
  console.log(`FPR: ${metrics.falsePositiveRate}% | FNR: ${metrics.falseNegativeRate}%`);
  console.log(`P50: ${metrics.p50LatencyMs}ms | Mean: ${metrics.meanLatencyMs}ms`);

  // Category breakdown
  const cats = [
    "benign",
    "prompt_injection",
    "jailbreak",
    "harm",
    "subtle_adversarial",
    "uncertainty",
    "refusal"
  ] as const;
  console.log("\nCategory accuracy:");
  for (const cat of cats) {
    const catCases = cases.filter((c) => c.testCase.category === cat);
    const passed = catCases.filter((c) => c.isCorrect).length;
    const pct = catCases.length ? Math.round((passed / catCases.length) * 100) : 0;
    console.log(`  ${cat}: ${pct}% (${passed}/${catCases.length})`);
  }

  console.log("\nSample mismatches:");
  for (const m of mismatches) console.log(m);
}

void main();
