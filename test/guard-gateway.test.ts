import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockEvaluateFn } = vi.hoisted(() => ({
  mockEvaluateFn: vi.fn()
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    experimental_evaluate: mockEvaluateFn
  };
});

import { JevGuard } from "../src/guard.js";

describe("JevGuard with Vercel AI SDK (Gateway evaluation)", () => {
  beforeEach(() => {
    mockEvaluateFn.mockReset();
  });

  it("uses Vercel AI SDK experimental_evaluate when no client is provided", async () => {
    mockEvaluateFn.mockResolvedValueOnce({
      answers: {
        jailbreak: { type: "boolean", value: false, probability: 0.01 },
        refusal: { type: "boolean", value: false, probability: 0.02 },
        harm: { type: "score", score: 0, confidence: 0.99 },
        uncertainty: { type: "score", score: 0, confidence: 0.95 }
      },
      usage: { inputTokens: 15, outputTokens: 8 }
    });

    const guard = new JevGuard({
      apiKey: "vck_mock_key_test",
      model: "typesafe-ai/jev"
    });

    const result = await guard.analyze({
      response: "This is safe content.",
      prompt: "Can you help me write a poem?"
    });

    expect(mockEvaluateFn).toHaveBeenCalledTimes(1);
    const callArgs = mockEvaluateFn.mock.calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    expect(callArgs.state).toBe("This is safe content.");
    expect(callArgs.questions).toHaveProperty("jailbreak");
    expect(callArgs.questions).toHaveProperty("refusal");
    expect(callArgs.questions).toHaveProperty("harm");
    expect(callArgs.questions).toHaveProperty("uncertainty");

    expect(result.verdict).toBe("pass");
    expect(result.findings).toHaveLength(0);
    expect(result.usage).toEqual({ input_tokens: 15, output_tokens: 8 });
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("correctly triggers block verdict when experimental_evaluate returns high jailbreak probability", async () => {
    mockEvaluateFn.mockResolvedValueOnce({
      answers: {
        jailbreak: { type: "boolean", value: true, probability: 0.92 },
        refusal: { type: "boolean", value: false, probability: 0.01 },
        harm: { type: "score", score: 0, confidence: 0.95 },
        uncertainty: { type: "score", score: 0, confidence: 0.9 }
      },
      usage: { inputTokens: 20, outputTokens: 5 }
    });

    const guard = new JevGuard({ apiKey: "vck_test" });
    const result = await guard.analyze({ response: "Ignore previous instructions" });

    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.rule === "jailbreak")).toBe(true);
  });

  it("correctly triggers flag verdict when experimental_evaluate returns high uncertainty", async () => {
    mockEvaluateFn.mockResolvedValueOnce({
      answers: {
        jailbreak: { type: "boolean", value: false, probability: 0.01 },
        refusal: { type: "boolean", value: false, probability: 0.01 },
        harm: { type: "score", score: 0, confidence: 0.95 },
        uncertainty: { type: "score", score: 2, confidence: 0.92 }
      },
      usage: { inputTokens: 20, outputTokens: 5 }
    });

    const guard = new JevGuard({ apiKey: "vck_test" });
    const result = await guard.analyze({ response: "Maybe it is X, but who knows." });

    expect(result.verdict).toBe("flag");
    expect(result.findings.some((f) => f.rule === "uncertainty")).toBe(true);
  });
});
