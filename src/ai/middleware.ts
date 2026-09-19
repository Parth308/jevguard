import type { LanguageModelMiddleware } from "ai";
import { JevGuard } from "../guard.js";
import { JevGuardBlockError } from "../errors.js";
import type {
  GuardInput,
  GuardVerdict,
  PromptGuardVerdict,
  PromptThresholds,
  Thresholds
} from "../types.js";
import { extractPromptText } from "./utils.js";

export interface JevGuardMiddlewareOptions {
  guard?: JevGuard | undefined;
  thresholds?: Partial<Thresholds> | undefined;
  onBlock?: ((verdict: GuardVerdict) => string | void) | undefined;
  onFlag?: ((verdict: GuardVerdict) => void) | undefined;
  includePrompt?: boolean | undefined;
  streamBufferMode?: boolean | undefined;
  guardPrompt?: boolean | undefined;
  promptThresholds?: Partial<PromptThresholds> | undefined;
  onPromptBlock?: ((verdict: PromptGuardVerdict) => string | void) | undefined;
}

export function createJevGuardMiddleware(
  options: JevGuardMiddlewareOptions = {}
): LanguageModelMiddleware {
  const guard = options.guard ?? new JevGuard();
  const includePrompt = options.includePrompt ?? true;

  return {
    wrapGenerate: async ({ doGenerate, params }: any) => {
      const promptText = extractPromptText(params.prompt);

      // Pre-flight prompt intent check before upstream LLM call
      if (options.guardPrompt && promptText) {
        const promptVerdict = await guard.analyzePrompt({
          prompt: promptText,
          ...(options.promptThresholds ? { thresholds: options.promptThresholds } : {})
        });

        if (promptVerdict.verdict === "block") {
          if (options.onPromptBlock) {
            const fallback = options.onPromptBlock(promptVerdict);
            if (typeof fallback === "string") {
              return {
                text: fallback,
                finishReason: "stop",
                usage: { promptTokens: 0, completionTokens: 0 },
                rawCall: { rawPrompt: null, rawSettings: {} }
              };
            }
          }
          const reasons = promptVerdict.findings.map((f) => f.message).join("; ");
          throw new JevGuardBlockError(
            `Prompt blocked by JevGuard: ${reasons}`,
            promptVerdict as unknown as GuardVerdict
          );
        }
      }

      const result = await doGenerate();
      if (result.text) {
        const prompt = includePrompt ? promptText : undefined;
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

    wrapStream: async ({ doStream, params }: any) => {
      const promptText = extractPromptText(params.prompt);

      // Pre-flight prompt intent check before upstream streaming call
      if (options.guardPrompt && promptText) {
        const promptVerdict = await guard.analyzePrompt({
          prompt: promptText,
          ...(options.promptThresholds ? { thresholds: options.promptThresholds } : {})
        });

        if (promptVerdict.verdict === "block") {
          if (options.onPromptBlock) {
            const fallback = options.onPromptBlock(promptVerdict);
            if (typeof fallback === "string") {
              const fallbackStream = new ReadableStream({
                start(controller) {
                  controller.enqueue({
                    type: "text-delta",
                    delta: fallback,
                    textDelta: fallback,
                    id: "jevguard-prompt-fallback"
                  });
                  controller.enqueue({
                    type: "finish",
                    finishReason: "stop",
                    usage: { promptTokens: 0, completionTokens: 0 }
                  });
                  controller.close();
                }
              });
              return {
                stream: fallbackStream,
                rawCall: { rawPrompt: null, rawSettings: {} }
              };
            }
          }
          const reasons = promptVerdict.findings.map((f) => f.message).join("; ");
          throw new JevGuardBlockError(
            `Prompt blocked by JevGuard: ${reasons}`,
            promptVerdict as unknown as GuardVerdict
          );
        }
      }

      const result = await doStream();
      const prompt = includePrompt ? promptText : undefined;
      const bufferMode = options.streamBufferMode ?? false;

      let accumulatedText = "";
      const bufferedChunks: any[] = [];

      const transformStream = new TransformStream<any, any>({
        transform(chunk, controller) {
          const delta = chunk.delta ?? chunk.textDelta;
          if (chunk.type === "text-delta" && typeof delta === "string") {
            accumulatedText += delta;
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
                      delta: fallback,
                      textDelta: fallback,
                      id: "jevguard-fallback"
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
