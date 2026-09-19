import type { SchemaErrorDetail, ZodTypeLike } from "./types.js";

/**
 * Strips markdown code blocks (e.g. ```json ... ```) wrapping JSON text.
 */
export function stripMarkdownCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match && match[1] !== undefined ? match[1].trim() : trimmed;
}

/**
 * Safely parses raw text into a JSON value.
 */
export function parseJsonSafely(
  raw: string
): { ok: true; value: unknown } | { ok: false; error: string } {
  const cleaned = stripMarkdownCodeFences(raw);
  try {
    const value = JSON.parse(cleaned);
    return { ok: true, value };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export type SchemaValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: SchemaErrorDetail[]; rawJsonError?: boolean };

/**
 * Validates a raw JSON string against a Zod-compatible schema.
 */
export function validateJsonWithSchema<T>(
  raw: string,
  schema: ZodTypeLike<T>
): SchemaValidationResult<T> {
  const parseResult = parseJsonSafely(raw);
  if (!parseResult.ok) {
    return {
      success: false,
      errors: [
        {
          path: "(root)",
          message: `Malformed JSON: ${parseResult.error}`
        }
      ],
      rawJsonError: true
    };
  }

  const schemaResult = schema.safeParse(parseResult.value);
  if (schemaResult.success) {
    return { success: true, data: schemaResult.data };
  }

  const issues =
    schemaResult.error.issues ?? schemaResult.error.errors ?? [];
  const errors: SchemaErrorDetail[] = [];

  if (issues.length > 0) {
    for (const issue of issues) {
      const pathStr = Array.isArray(issue.path) && issue.path.length > 0
        ? issue.path.map(String).join(".")
        : "(root)";
      errors.push({
        path: pathStr,
        message: issue.message ?? "Failed schema validation"
      });
    }
  } else {
    errors.push({
      path: "(root)",
      message: schemaResult.error.message ?? "Schema validation failed"
    });
  }

  return { success: false, errors };
}

/**
 * Extracts target string content from parsed data to send to Jev for semantic evaluation.
 */
export function extractTextForGuard<T>(
  data: unknown,
  targetFields?: Array<keyof T | string>
): string {
  if (data === null || data === undefined) {
    return "";
  }

  if (typeof data !== "object") {
    return String(data);
  }

  const obj = data as Record<string, unknown>;

  if (targetFields && targetFields.length > 0) {
    const extracted: string[] = [];
    for (const key of targetFields) {
      const strKey = String(key);
      const val = obj[strKey];
      if (val !== undefined && val !== null) {
        if (typeof val === "string") {
          extracted.push(`${strKey}: ${val}`);
        } else {
          extracted.push(`${strKey}: ${JSON.stringify(val)}`);
        }
      }
    }
    if (extracted.length > 0) {
      return extracted.join("\n");
    }
  }

  // If no target fields specified or none matched, serialize clean JSON
  return JSON.stringify(data, null, 2);
}
