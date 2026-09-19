import { describe, expect, it, vi } from "vitest";
import { JevGuard, type SystemOneClient } from "../src/guard.js";
import { DEFAULT_THRESHOLDS } from "../src/types.js";
import { DEFAULT_PROFILE } from "../src/questions.js";

function makeStubClient(overrides?: {
  answers?: any;
  usage?: { input_tokens: number; output_tokens: number };
}): { client: SystemOneClient; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(async (_req: any) => ({
    model: "jev-latest",
    answers: overrides?.answers ?? [
      { type: "noul", noul: 0.02 },
      { type: "noul", noul: 0.05 },
      {
        type: "score",
        score: 0,
        confidence: 0.95,
        legend: { 0: "Low", 1: "Medium", 2: "High" },
        probabilities: { 0: 0.95, 1: 0.04, 2: 0.01 }
      },
      {
        type: "score",
        score: 0,
        confidence: 0.9,
        legend: { 0: "Low", 1: "Medium", 2: "High" },
        probabilities: { 0: 0.9, 1: 0.09, 2: 0.01 }
      }
    ],
    usage: overrides?.usage ?? { input_tokens: 12, output_tokens: 6 }
  }));

  return {
    client: { systemOne: spy } as SystemOneClient,
    spy
  };
}

describe("JevGuard class", () => {
  it("case 1: analyze calls systemOne once with questions matching DEFAULT_PROFILE", async () => {
    const { client, spy } = makeStubClient();
    const guard = new JevGuard(client);

    await guard.analyze({ response: "Test response" });

    expect(spy).toHaveBeenCalledTimes(1);
    const req = spy.mock.calls[0]?.[0];
    expect(req).toBeDefined();
    expect(req.questions).toHaveLength(4);
    expect(req.questions).toBe(DEFAULT_PROFILE);
  });

  it("case 2: state includes response and strictly omits prompt key when prompt is not provided", async () => {
    const { client, spy } = makeStubClient();
    const guard = new JevGuard(client);

    await guard.analyze({ response: "Test response" });

    const req = spy.mock.calls[0]?.[0];
    expect(req).toBeDefined();
    expect(req.state).toHaveProperty("response", "Test response");
    expect(req.state).not.toHaveProperty("prompt");
  });

  it("case 3: state includes prompt when prompt is provided in input", async () => {
    const { client, spy } = makeStubClient();
    const guard = new JevGuard(client);

    await guard.analyze({ prompt: "User prompt", response: "Test response" });

    const req = spy.mock.calls[0]?.[0];
    expect(req).toBeDefined();
    expect(req.state).toHaveProperty("prompt", "User prompt");
    expect(req.state).toHaveProperty("response", "Test response");
  });

  it("case 4: returns usage and numeric latencyMs passthrough", async () => {
    const usage = { input_tokens: 42, output_tokens: 18 };
    const { client } = makeStubClient({ usage });
    const guard = new JevGuard(client);

    const verdict = await guard.analyze({ response: "Test response" });

    expect(verdict.usage).toEqual(usage);
    expect(typeof verdict.latencyMs).toBe("number");
    expect(verdict.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("case 5: constructor and per-call threshold overrides work as expected", async () => {
    // Stub returns harm score 2, which blocks by default (harmBlock: 1.5)
    const { client } = makeStubClient({
      answers: [
        { type: "noul", noul: 0.02 },
        { type: "noul", noul: 0.05 },
        { type: "score", score: 2, confidence: 0.95 },
        { type: "score", score: 0, confidence: 0.9 }
      ]
    });

    // With constructor threshold override harmBlock = 3, score 2 should not block
    const guard = new JevGuard(client, { ...DEFAULT_THRESHOLDS, harmBlock: 3 });
    const result = await guard.analyze({ response: "Test response" });
    expect(result.verdict).not.toBe("block");
    expect(result.verdict).toBe("flag");

    // Per-call threshold override should also take effect
    const defaultGuard = new JevGuard(client);
    const perCallResult = await defaultGuard.analyze({
      response: "Test response",
      thresholds: { harmBlock: 3 }
    });
    expect(perCallResult.verdict).not.toBe("block");
    expect(perCallResult.verdict).toBe("flag");
  });

  it("case 6: new JevGuard() with NO args constructs cleanly without throwing", () => {
    const originalKey = process.env["TYPESAFE_API_KEY"];
    delete process.env["TYPESAFE_API_KEY"];
    try {
      expect(() => new JevGuard()).not.toThrow();
    } finally {
      if (originalKey !== undefined) {
        process.env["TYPESAFE_API_KEY"] = originalKey;
      }
    }
  });
});
