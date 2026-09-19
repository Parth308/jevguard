export function extractPromptText(prompt: unknown): string | undefined {
  if (typeof prompt === "string") {
    return prompt;
  }
  if (!Array.isArray(prompt)) {
    return undefined;
  }

  // Iterate backwards to find the last user message
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i];
    if (
      msg &&
      typeof msg === "object" &&
      "role" in msg &&
      (msg as { role: string }).role === "user" &&
      "content" in msg
    ) {
      const content = (msg as { content: unknown }).content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        const textParts = content
          .filter(
            (p: unknown): p is { type: string; text: string } =>
              p !== null &&
              typeof p === "object" &&
              "type" in p &&
              (p as { type: string }).type === "text" &&
              "text" in p &&
              typeof (p as { text: unknown }).text === "string"
          )
          .map((p) => p.text);
        if (textParts.length > 0) {
          return textParts.join("\n");
        }
      }
    }
  }

  return undefined;
}
