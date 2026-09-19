import type { LanguageModelV1Middleware, LanguageModelV1StreamPart } from "ai";
import { JevGuard } from "../guard.js";
import { JevGuardBlockError } from "../errors.js";
import type { GuardInput, GuardVerdict, Thresholds } from "../types.js";
import { extractPromptText } from "./utils.js";

export interface JevGuardMiddlewareOptions {
  guard?: JevGuard;
  thresholds?: Partial<Thresholds>;
  onBlock?: (verdict: GuardVerdict) => string | void;
  onFlag?: (verdict: GuardVerdict) => void;
  includePrompt?: boolean;
  streamBufferMode?: boolean;
}

export function createJevGuardMiddleware(
  options: JevGuardMiddlewareOptions = {}
): LanguageModelV1Middleware {
  const guard = options.guard ?? new JevGuard();
  const includePrompt = options.includePrompt ?? true;

  return {
    middlewareVersion: "v1",

    wrapGenerate: async ({ doGenerate, params }) => {
      const result = await doGenerate();
      if (result.text) {
        const prompt = includePrompt ? extractPromptText(params.prompt) : undefined;
        const guardInput: GuardInput = {
          response: result.text
        };
        if (prompt !== undefined) {
          guardInput.prompt = prompt;
        }
        if (options.thresholds !== undefined) {
          guardInput.thresholds = options.thresholds;
        }

        const verdict = await guard.analyze(guardInput);

        if (verdict.verdict === "block") {
          if (options.onBlock) {
            const fallback = options.onBlock(verdict);
            if (typeof fallback === "string") {
              return {
                ...result,
                text: fallback
              };
            }
          }
          const reasons = verdict.findings.map((f) => f.message).join("; ");
          throw new JevGuardBlockError(
            `Response blocked by JevGuard: ${reasons}`,
            verdict
          );
        }

        if (verdict.verdict === "flag" && options.onFlag) {
          options.onFlag(verdict);
        }
      }
      return result;
    },

    wrapStream: async ({ doStream, params }) => {
      const result = await doStream();
      const prompt = includePrompt ? extractPromptText(params.prompt) : undefined;
      const bufferMode = options.streamBufferMode ?? false;

      let accumulatedText = "";
      const bufferedChunks: LanguageModelV1StreamPart[] = [];

      const transformStream = new TransformStream<
        LanguageModelV1StreamPart,
        LanguageModelV1StreamPart
      >({
        transform(chunk, controller) {
          if (chunk.type === "text-delta" && typeof chunk.textDelta === "string") {
            accumulatedText += chunk.textDelta;
          }
          if (bufferMode) {
            bufferedChunks.push(chunk);
          } else {
            controller.enqueue(chunk);
          }
        },
        async flush(controller) {
          if (accumulatedText.length > 0) {
            const guardInput: GuardInput = {
              response: accumulatedText
            };
            if (prompt !== undefined) {
              guardInput.prompt = prompt;
            }
            if (options.thresholds !== undefined) {
              guardInput.thresholds = options.thresholds;
            }

            const verdict = await guard.analyze(guardInput);

            if (verdict.verdict === "block") {
              if (options.onBlock) {
                const fallback = options.onBlock(verdict);
                if (typeof fallback === "string") {
                  if (bufferMode) {
                    controller.enqueue({
                      type: "text-delta",
                      textDelta: fallback
                    });
                    controller.enqueue({
                      type: "finish",
                      finishReason: "stop",
                      usage: { promptTokens: 0, completionTokens: 0 }
                    });
                    return;
                  }
                }
              }
              const reasons = verdict.findings.map((f) => f.message).join("; ");
              controller.error(
                new JevGuardBlockError(`Stream blocked by JevGuard: ${reasons}`, verdict)
              );
              return;
            }

            if (verdict.verdict === "flag" && options.onFlag) {
              options.onFlag(verdict);
            }
          }

          if (bufferMode) {
            for (const chunk of bufferedChunks) {
              controller.enqueue(chunk);
            }
          }
        }
      });

      return {
        ...result,
        stream: result.stream.pipeThrough(transformStream)
      };
    }
  };
}
