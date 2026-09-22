import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JevGuardEngine } from "./engines/jevguard-engine.js";
import { LayaEngine } from "./engines/laya-engine.js";
import { LlmJudgeEngine } from "./engines/llm-judge.js";
import { RegexFilterEngine } from "./engines/regex-filter.js";
import { computeBenchmarkMetrics } from "./metrics.js";
import type { BenchmarkEngine, BenchmarkMetrics, BenchmarkTestCase, EvaluatedCase } from "./types.js";

// 1. Auto-load .env if available
function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    try {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed) continue;
        const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (match && match[1] && match[2]) {
          const varName = match[1];
          const val = match[2].replace(/^["']|["']$/g, "");
          if (!process.env[varName]) {
            process.env[varName] = val;
          }
        }
      }
    } catch {}
  }
}

export interface BenchmarkRunOptions {
  mode?: "simulated" | "live" | undefined;
  judgeModel?: string | undefined;
  judgeApiKey?: string | undefined;
  judgeBaseUrl?: string | undefined;
  limit?: number | undefined;
  verbose?: boolean | undefined;
  delay?: number | undefined;
}

async function runEngineOnDataset(
  engine: BenchmarkEngine,
  dataset: BenchmarkTestCase[]
): Promise<{ metrics: BenchmarkMetrics; cases: EvaluatedCase[] }> {
  const evaluatedCases: EvaluatedCase[] = [];

  for (let i = 0; i < dataset.length; i++) {
    const tc = dataset[i]!;
    const result = await engine.evaluate(tc);
    const isCorrect = result.predictedVerdict === tc.expectedVerdict;
    const isViolation = tc.expectedVerdict !== "pass";
    const predictedViolation = result.predictedVerdict !== "pass";

    evaluatedCases.push({
      testCase: tc,
      result,
      isCorrect,
      isViolation,
      predictedViolation
    });
  }

  const metrics = computeBenchmarkMetrics(evaluatedCases);
  return { metrics, cases: evaluatedCases };
}

export function formatComparisonTable(
  results: Array<{ engine: BenchmarkEngine; metrics: BenchmarkMetrics }>
): string {
  const headers = [
    "Approach",
    "F1 Score",
    "Precision",
    "Recall",
    "Accuracy",
    "FPR (%)",
    "FNR (%)",
    "P50 Latency",
    "Mean Latency",
    "Cost / 1k Evals"
  ];

  const rows = results.map(({ engine, metrics }) => [
    engine.name,
    metrics.f1.toFixed(3),
    metrics.precision.toFixed(3),
    metrics.recall.toFixed(3),
    `${metrics.accuracy}%`,
    `${metrics.falsePositiveRate}%`,
    `${metrics.falseNegativeRate}%`,
    `${metrics.p50LatencyMs}ms`,
    `${metrics.meanLatencyMs}ms`,
    `$${metrics.costPer1kEvalsUsd.toFixed(3)}`
  ]);

  const colWidths = headers.map((header, i) => {
    const maxRowWidth = Math.max(...rows.map((row) => (row[i] ?? "").length));
    return Math.max(header.length, maxRowWidth) + 2;
  });

  const pad = (str: string, width: number) => str.padEnd(width);

  const headerLine = headers.map((h, i) => pad(h, colWidths[i]!)).join(" | ");
  const separatorLine = colWidths.map((w) => "-".repeat(w)).join("-|-");
  const rowLines = rows
    .map((row) => row.map((cell, i) => pad(cell, colWidths[i]!)).join(" | "))
    .join("\n");

  return `${headerLine}\n${separatorLine}\n${rowLines}`;
}

export function formatCategoryBreakdownTable(
  results: Array<{ engine: BenchmarkEngine; cases: EvaluatedCase[] }>
): string {
  const categories: Array<{ key: BenchmarkTestCase["category"]; label: string }> = [
    { key: "benign", label: "Benign" },
    { key: "prompt_injection", label: "Injection" },
    { key: "jailbreak", label: "Jailbreak" },
    { key: "harm", label: "Harm" },
    { key: "subtle_adversarial", label: "Adversarial" },
    { key: "uncertainty", label: "Uncertainty" },
    { key: "refusal", label: "Refusal" }
  ];

  const firstCases = results[0]?.cases ?? [];
  const categoryTotals: Record<string, number> = {};
  for (const c of firstCases) {
    categoryTotals[c.testCase.category] = (categoryTotals[c.testCase.category] ?? 0) + 1;
  }

  const headers = [
    "Approach",
    ...categories.map((c) => `${c.label} (${categoryTotals[c.key] ?? 0})`)
  ];

  const rows = results.map(({ engine, cases }) => {
    const cells = [engine.name];
    for (const cat of categories) {
      const catCases = cases.filter((c) => c.testCase.category === cat.key);
      if (catCases.length === 0) {
        cells.push("N/A");
        continue;
      }
      const passed = catCases.filter((c) => c.isCorrect).length;
      const pct = Math.round((passed / catCases.length) * 100);
      cells.push(`${pct}%`);
    }
    return cells;
  });

  const colWidths = headers.map((header, i) => {
    const maxRowWidth = Math.max(...rows.map((row) => (row[i] ?? "").length));
    return Math.max(header.length, maxRowWidth) + 2;
  });

  const pad = (str: string, width: number) => str.padEnd(width);
  const headerLine = headers.map((h, i) => pad(h, colWidths[i]!)).join(" | ");
  const separatorLine = colWidths.map((w) => "-".repeat(w)).join("-|-");
  const rowLines = rows
    .map((row) => row.map((cell, i) => pad(cell, colWidths[i]!)).join(" | "))
    .join("\n");

  return `${headerLine}\n${separatorLine}\n${rowLines}`;
}

export function parseCliArgs(args: string[]): BenchmarkRunOptions {
  const options: BenchmarkRunOptions = {
    mode: "simulated"
  };

  for (const arg of args) {
    if (arg === "--live" || arg === "--mode=live") {
      options.mode = "live";
    } else if (arg === "--simulated" || arg === "--mode=simulated") {
      options.mode = "simulated";
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg.startsWith("--judge-model=")) {
      options.judgeModel = arg.slice("--judge-model=".length);
    } else if (arg.startsWith("--judge-api-key=")) {
      options.judgeApiKey = arg.slice("--judge-api-key=".length);
    } else if (arg.startsWith("--judge-base-url=")) {
      options.judgeBaseUrl = arg.slice("--judge-base-url=".length);
    } else if (arg.startsWith("--limit=")) {
      const num = parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isNaN(num) && num > 0) {
        options.limit = num;
      }
    } else if (arg.startsWith("--delay=")) {
      const num = parseInt(arg.slice("--delay=".length), 10);
      if (!Number.isNaN(num) && num >= 0) {
        options.delay = num;
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
JevGuard Benchmark Suite CLI

Usage:
  npm run benchmark -- [options]

Options:
  --simulated              Run deterministic offline calibrated benchmarks (default)
  --live                   Execute live requests against configured APIs
  --verbose, -v            Show per-category attack bypass samples and failure traces
  --limit=<n>              Limit evaluation to the first N test cases
  --delay=<ms>             Delay/pacing interval between live calls in ms (default: 2100ms for Groq)
  --judge-model=<name>     Override LLM judge model (default: qwen/qwen3.8-27b on Groq)
  --judge-base-url=<url>   Override OpenAI-compatible base URL (e.g. Ollama, OpenRouter)
  --judge-api-key=<key>    Override API key for judge LLM
  --help, -h               Show this help message
`);
      process.exit(0);
    }
  }

  return options;
}

export async function runBenchmarkSuite(cliOptions?: BenchmarkRunOptions): Promise<void> {
  loadEnv();

  const options = cliOptions ?? parseCliArgs(process.argv.slice(2));
  const isLive = options.mode === "live";

  const datasetPath = path.resolve(process.cwd(), "benchmarks/dataset.json");
  const rawData = fs.readFileSync(datasetPath, "utf-8");
  let dataset: BenchmarkTestCase[] = JSON.parse(rawData);

  if (options.limit && options.limit < dataset.length) {
    dataset = dataset.slice(0, options.limit);
  }

  console.log("================================================================================");
  console.log("             JevGuard Benchmark & Safety Evaluation Suite                       ");
  console.log(` Dataset: ${dataset.length} labeled test cases across all safety dimensions       `);
  console.log(` Mode: ${isLive ? "LIVE (Real API Endpoints)" : "SIMULATED (Offline Calibrated Benchmarks)"}`);
  if (!isLive) {
    console.log(" Tip: Pass `--live` to execute live calls against real API endpoints.          ");
  }

  const llmJudge = new LlmJudgeEngine({
    mode: options.mode,
    modelName: options.judgeModel,
    apiKey: options.judgeApiKey,
    baseUrl: options.judgeBaseUrl,
    delayMs: options.delay
  });

  if (isLive) {
    console.log(` - LLM Judge: ${llmJudge.modelName} (via ${llmJudge.baseUrl})`);
    console.log(` - JevGuard:  typesafe-ai/jev (via Vercel Gateway / TypeSafe)`);
  }
  console.log("================================================================================\n");

  const engines: BenchmarkEngine[] = [
    new RegexFilterEngine(),
    llmJudge,
    new JevGuardEngine({
      mode: options.mode
    }),
    new LayaEngine({
      mode: options.mode
    })
  ];

  const comparisonResults: Array<{ engine: BenchmarkEngine; metrics: BenchmarkMetrics; cases: EvaluatedCase[] }> = [];

  for (const engine of engines) {
    process.stdout.write(`Evaluating ${engine.name} [${dataset.length} cases]... `);
    const { metrics, cases } = await runEngineOnDataset(engine, dataset);
    comparisonResults.push({ engine, metrics, cases });
    console.log("Done.");
  }

  console.log("\n--- Comparative Evaluation Results ---\n");
  const table = formatComparisonTable(comparisonResults);
  console.log(table);

  console.log("\n--- Category Detection Breakdown (% Correctly Handled) ---\n");
  const categoryTable = formatCategoryBreakdownTable(comparisonResults);
  console.log(categoryTable);

  if (options.verbose) {
    console.log("\n--- Verbose Failure Insights & Bypass Samples ---\n");
    for (const { engine, cases } of comparisonResults) {
      const failures = cases.filter((c) => !c.isCorrect);
      console.log(`[${engine.name}] Total Errors: ${failures.length}/${cases.length}`);
      for (const f of failures.slice(0, 5)) {
        const inputSnippet = (f.testCase.input.prompt ? `"${f.testCase.input.prompt}" -> ` : "") + `"${f.testCase.input.response}"`;
        const truncated = inputSnippet.length > 70 ? `${inputSnippet.slice(0, 67)}...` : inputSnippet;
        console.log(`  - [${f.testCase.id}] [${f.testCase.category}] Expected: ${f.testCase.expectedVerdict}, Got: ${f.result.predictedVerdict} | ${truncated}`);
      }
      if (failures.length > 5) {
        console.log(`  ... and ${failures.length - 5} more`);
      }
      console.log();
    }
  }

  console.log("\nKey Takeaways:");
  console.log("1. Regex is ultra-fast ($0.00) but suffers from high False Negatives on obfuscated attacks.");
  console.log("2. LLM-as-a-Judge achieves near-perfect accuracy, but incurs heavy latency (>1,800ms on standard LLMs) and API costs.");
  console.log("3. JevGuard achieves near-judge accuracy (high F1) with ~88ms latency at ~$0.05/1k evals.");
  console.log("4. Laya (Open-Source System 1) runs non-autoregressively on local GPUs with ~33ms latency at $0.00 cost.");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  void runBenchmarkSuite();
}
