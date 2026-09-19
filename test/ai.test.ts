import { describe, expect, it, vi } from "vitest";
import type { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1StreamPart } from "ai";
import { createJevGuardMiddleware } from "../src/ai/middleware.js";
import { extractPromptText } from "../src/ai/utils.js";
import { JevGuardBlockError } from "../src/errors.js";
import { JevGuard, type SystemOneClient } from "../src/guard.js";

function makeStubClient(overrides?: { answers?: any[] }): SystemOneClient {
  return {
    async systemOne() {
      return {
        model: "jev-latest",
        answers: overrides?.answers ?? [
          { type: "noul", noul: 0.01 },
          { type: "noul", noul: 0.01 },
          { type: "score", score: 0, confidence: 0.95 },
          { type: "score", score: 0, confidence: 0.9 }
        ],
        usage: { input_tokens: 10, output_tokens: 5 }
      } as any;
    }
  };
}

function makeDummyCallOptions(userPrompt = "Test prompt"): LanguageModelV1CallOptions {
  return {
    inputFormat: "prompt",
    mode: { type: "regular" },
    prompt: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: [{ type: "text", text: userPrompt }] }
    ]
  };
}

function createMockModel(generatedText = "Safe response"): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: "mock-provider",
    modelId: "mock-model",
    defaultObjectGenerationMode: "json",
    doGenerate: async () => ({
      text: generatedText,
      finishReason: "stop",
      usage: { promptTokens: 5, completionTokens: 10 },
      rawCall: { rawPrompt: null, rawSettings: {} }
    }),
    doStream: async () => {
      const chunks: LanguageModelV1StreamPart[] = [
        { type: "text-delta", textDelta: generatedText.slice(0, 4) },
        { type: "text-delta", textDelta: generatedText.slice(4) },
        {
          type: "finish",
          finishReason: "stop",
          usage: { promptTokens: 5, completionTokens: 10 }
        }
      ];

      const stream = new ReadableStream<LanguageModelV1StreamPart>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        }
      });

      return {
        stream,
        rawCall: { rawPrompt: null, rawSettings: {} }
      };
    }
  };
}

describe("Vercel AI SDK Middleware (createJevGuardMiddleware)", () => {
  describe("extractPromptText", () => {
    it("extracts plain string prompt", () => {
      expect(extractPromptText("Hello world")).toBe("Hello world");
    });

    it("extracts text from message array with string content", () => {
      const prompt = [
        { role: "system", content: "System instructions" },
        { role: "user", content: "User question" }
      ];
      expect(extractPromptText(prompt)).toBe("User question");
    });

    it("extracts text from multipart content parts", () => {
      const prompt = [
        {
          role: "user",
          content: [
            { type: "text", text: "Part 1" },
            { type: "text", text: "Part 2" }
          ]
        }
      ];
      expect(extractPromptText(prompt)).toBe("Part 1\nPart 2");
    });

    it("returns undefined when no user prompt is found", () => {
      expect(extractPromptText([{ role: "system", content: "System" }])).toBeUndefined();
      expect(extractPromptText(null)).toBeUndefined();
    });
  });

  describe("wrapGenerate", () => {
    it("allows benign text to pass through without errors", async () => {
      const stub = makeStubClient();
      const guard = new JevGuard(stub);
      const middleware = createJevGuardMiddleware({ guard });

      const model = createMockModel("Safe and sound");
      const result = await middleware.wrapGenerate!({
        doGenerate: () => model.doGenerate(makeDummyCallOptions()),
        doStream: () => model.doStream(makeDummyCallOptions()),
        params: makeDummyCallOptions(),
        model
      });

      expect(result.text).toBe("Safe and sound");
    });

    it("throws JevGuardBlockError on hazardous output", async () => {
      const blockingAnswers = [
        { type: "noul", noul: 0.95 }, // jailbreak
        { type: "noul", noul: 0.01 },
        { type: "score", score: 0, confidence: 0.95 },
        { type: "score", score: 0, confidence: 0.9 }
      ];
      const stub = makeStubClient({ answers: blockingAnswers });
      const guard = new JevGuard(stub);
      const middleware = createJevGuardMiddleware({ guard });

      const model = createMockModel("Dangerous jailbreak payload");

      await expect(
        middleware.wrapGenerate!({
          doGenerate: () => model.doGenerate(makeDummyCallOptions()),
          doStream: () => model.doStream(makeDummyCallOptions()),
          params: makeDummyCallOptions(),
          model
        })
      ).rejects.toThrow(JevGuardBlockError);
    });

    it("replaces text with fallback when onBlock returns a string", async () => {
      const blockingAnswers = [
        { type: "noul", noul: 0.95 },
        { type: "noul", noul: 0.01 },
        { type: "score", score: 0, confidence: 0.95 },
        { type: "score", score: 0, confidence: 0.9 }
      ];
      const stub = makeStubClient({ answers: blockingAnswers });
      const guard = new JevGuard(stub);

      const onBlock = vi.fn((_verdict) => "This response was safely redacted.");
      const middleware = createJevGuardMiddleware({ guard, onBlock });

      const model = createMockModel("Dangerous payload");
      const result = await middleware.wrapGenerate!({
        doGenerate: () => model.doGenerate(makeDummyCallOptions()),
        doStream: () => model.doStream(makeDummyCallOptions()),
        params: makeDummyCallOptions(),
        model
      });

      expect(onBlock).toHaveBeenCalledTimes(1);
      expect(result.text).toBe("This response was safely redacted.");
    });

    it("calls onFlag callback when output triggers flag severity", async () => {
      const flaggingAnswers = [
        { type: "noul", noul: 0.01 },
        { type: "noul", noul: 0.01 },
        { type: "score", score: 0, confidence: 0.95 },
        { type: "score", score: 2, confidence: 0.9 } // high uncertainty => flag
      ];
      const stub = makeStubClient({ answers: flaggingAnswers });
      const guard = new JevGuard(stub);

      const onFlag = vi.fn();
      const middleware = createJevGuardMiddleware({ guard, onFlag });

      const model = createMockModel("Uncertain speculation");
      const result = await middleware.wrapGenerate!({
        doGenerate: () => model.doGenerate(makeDummyCallOptions()),
        doStream: () => model.doStream(makeDummyCallOptions()),
        params: makeDummyCallOptions(),
        model
      });

      expect(onFlag).toHaveBeenCalledTimes(1);
      expect(result.text).toBe("Uncertain speculation");
    });
  });

  describe("wrapStream", () => {
    it("streams benign chunks smoothly", async () => {
      const stub = makeStubClient();
      const guard = new JevGuard(stub);
      const middleware = createJevGuardMiddleware({ guard });

      const model = createMockModel("Safe stream");
      const result = await middleware.wrapStream!({
        doGenerate: () => model.doGenerate(makeDummyCallOptions()),
        doStream: () => model.doStream(makeDummyCallOptions()),
        params: makeDummyCallOptions(),
        model
      });

      const reader = result.stream.getReader();
      const chunks: LanguageModelV1StreamPart[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      const fullText = chunks
        .filter((c) => c.type === "text-delta")
        .map((c) => (c as { textDelta: string }).textDelta)
        .join("");
      expect(fullText).toBe("Safe stream");
    });

    it("triggers JevGuardBlockError on stream completion when output is blocked", async () => {
      const blockingAnswers = [
        { type: "noul", noul: 0.95 },
        { type: "noul", noul: 0.01 },
        { type: "score", score: 0, confidence: 0.95 },
        { type: "score", score: 0, confidence: 0.9 }
      ];
      const stub = makeStubClient({ answers: blockingAnswers });
      const guard = new JevGuard(stub);
      const middleware = createJevGuardMiddleware({ guard });

      const model = createMockModel("Violating stream");
      const result = await middleware.wrapStream!({
        doGenerate: () => model.doGenerate(makeDummyCallOptions()),
        doStream: () => model.doStream(makeDummyCallOptions()),
        params: makeDummyCallOptions(),
        model
      });

      const reader = result.stream.getReader();
      let errorThrown: any = null;
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).toBeInstanceOf(JevGuardBlockError);
    });

    it("buffers stream and returns fallback replacement when streamBufferMode is true and onBlock returns text", async () => {
      const blockingAnswers = [
        { type: "noul", noul: 0.95 },
        { type: "noul", noul: 0.01 },
        { type: "score", score: 0, confidence: 0.95 },
        { type: "score", score: 0, confidence: 0.9 }
      ];
      const stub = makeStubClient({ answers: blockingAnswers });
      const guard = new JevGuard(stub);

      const middleware = createJevGuardMiddleware({
        guard,
        streamBufferMode: true,
        onBlock: () => "Safe fallback"
      });

      const model = createMockModel("Unsafe buffered content");
      const result = await middleware.wrapStream!({
        doGenerate: () => model.doGenerate(makeDummyCallOptions()),
        doStream: () => model.doStream(makeDummyCallOptions()),
        params: makeDummyCallOptions(),
        model
      });

      const reader = result.stream.getReader();
      const chunks: LanguageModelV1StreamPart[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const textDeltas = chunks
        .filter((c) => c.type === "text-delta")
        .map((c) => (c as { textDelta: string }).textDelta);
      expect(textDeltas.join("")).toBe("Safe fallback");
    });
  });
});
