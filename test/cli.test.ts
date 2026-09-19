import { describe, expect, it } from "vitest";
import { parseArgs, runCli, type CliDeps } from "../src/cli.js";
import { JevGuard, type SystemOneClient } from "../src/guard.js";

function makeStubClient(answers: any[]): SystemOneClient {
  return {
    async systemOne() {
      return {
        model: "jev-latest",
        answers,
        usage: { input_tokens: 10, output_tokens: 5 }
      } as any;
    }
  };
}

function makeDeps(guardAnswers?: any[], throwError?: boolean): {
  deps: CliDeps;
  stdoutLines: string[];
  stderrLines: string[];
  exitCode: () => number | null;
} {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let exitCode: number | null = null;

  const stubClient = throwError
    ? ({
        async systemOne() {
          throw new Error("Simulated network failure");
        }
      } as SystemOneClient)
    : makeStubClient(
        guardAnswers ?? [
          { type: "noul", noul: 0.01 },
          { type: "noul", noul: 0.01 },
          { type: "score", score: 0, confidence: 0.95 },
          { type: "score", score: 0, confidence: 0.9 }
        ]
      );

  const deps: CliDeps = {
    createGuard: () => new JevGuard(stubClient),
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line),
    exit: (code) => {
      exitCode = code;
    }
  };

  return { deps, stdoutLines, stderrLines, exitCode: () => exitCode };
}

describe("CLI parser and runner", () => {
  it("case 1: parseArgs(['--response', 'x']) -> { response: 'x', pretty: false }", () => {
    const opts = parseArgs(["--response", "x"]);
    expect(opts.response).toBe("x");
    expect(opts.pretty).toBe(false);
    expect(opts.prompt).toBeUndefined();
  });

  it("case 2: parseArgs(['--response=x', '--prompt=y', '--pretty']) -> all fields set", () => {
    const opts = parseArgs(["--response=x", "--prompt=y", "--pretty"]);
    expect(opts.response).toBe("x");
    expect(opts.prompt).toBe("y");
    expect(opts.pretty).toBe(true);
  });

  it("case 3: parseArgs(['--nope', 'x']) throws an error", () => {
    expect(() => parseArgs(["--nope", "x"])).toThrow(/unknown flag/i);
  });

  it("case 4: runCli with benign stub exits with 0 and prints pass verdict JSON", async () => {
    const harness = makeDeps();
    await runCli(["--response", "Hello there"], harness.deps);

    expect(harness.exitCode()).toBe(0);
    expect(harness.stderrLines).toHaveLength(0);
    expect(harness.stdoutLines).toHaveLength(1);

    const firstLine = harness.stdoutLines[0] ?? "";
    const parsed = JSON.parse(firstLine);
    expect(parsed.verdict).toBe("pass");
    expect(parsed.findings).toEqual([]);
    expect(parsed.usage).toBeDefined();
    expect(typeof parsed.latencyMs).toBe("number");
  });

  it("case 5: runCli with blocking stub answers (jailbreak 0.9) exits with 2", async () => {
    const blockingAnswers = [
      { type: "noul", noul: 0.9 },
      { type: "noul", noul: 0.01 },
      { type: "score", score: 0, confidence: 0.95 },
      { type: "score", score: 0, confidence: 0.9 }
    ];
    const harness = makeDeps(blockingAnswers);
    await runCli(["--response", "Malicious text"], harness.deps);

    expect(harness.exitCode()).toBe(2);
    const parsed = JSON.parse(harness.stdoutLines[0] ?? "");
    expect(parsed.verdict).toBe("block");
  });

  it("case 6: runCli with flagging stub answers (uncertainty score 2, conf 0.9) exits with 1", async () => {
    const flaggingAnswers = [
      { type: "noul", noul: 0.01 },
      { type: "noul", noul: 0.01 },
      { type: "score", score: 0, confidence: 0.95 },
      { type: "score", score: 2, confidence: 0.9 }
    ];
    const harness = makeDeps(flaggingAnswers);
    await runCli(["--response", "Uncertain text"], harness.deps);

    expect(harness.exitCode()).toBe(1);
    const parsed = JSON.parse(harness.stdoutLines[0] ?? "");
    expect(parsed.verdict).toBe("flag");
  });

  it("case 7: runCli with no --response exits with 3 and displays required error", async () => {
    const harness = makeDeps();
    await runCli([], harness.deps);

    expect(harness.exitCode()).toBe(3);
    expect(harness.stdoutLines).toHaveLength(0);
    expect(harness.stderrLines.some((l) => l.includes("--response is required"))).toBe(true);
  });

  it("case 8: runCli when guard throws exits with 3 and prints Guard failed", async () => {
    const harness = makeDeps(undefined, true);
    await runCli(["--response", "Hello"], harness.deps);

    expect(harness.exitCode()).toBe(3);
    expect(harness.stderrLines.some((l) => l.includes("Guard failed"))).toBe(true);
  });

  it("case 9: runCli with --pretty prints formatted multiline JSON", async () => {
    const harness = makeDeps();
    await runCli(["--response", "Hello", "--pretty"], harness.deps);

    expect(harness.exitCode()).toBe(0);
    const output = harness.stdoutLines[0] ?? "";
    expect(output).toContain("\n");
  });
});
