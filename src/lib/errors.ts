/**
 * Builds a concise, LLM-friendly error string from an HTTP response and parsed JSON/text body.
 */
export function formatApiError(
  status: number,
  statusText: string,
  body: unknown,
): string {
  const parts: string[] = [`HTTP ${status} ${statusText}`.trim()];

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.length > 0) {
      parts.push(`Message: ${o.message}`);
    }
    if (typeof o.status === "string" && o.status.length > 0) {
      parts.push(`API status: ${o.status}`);
    }
    if (typeof o.code === "number") {
      parts.push(`Code: ${o.code}`);
    }
    if (Array.isArray(o.errors) && o.errors.length > 0) {
      parts.push(`Details: ${JSON.stringify(o.errors)}`);
    }
    if (parts.length === 1) {
      parts.push(`Body: ${JSON.stringify(body)}`);
    }
  } else if (typeof body === "string" && body.length > 0 && body.length < 2000) {
    parts.push(body);
  } else if (body !== undefined && body !== null) {
    try {
      parts.push(JSON.stringify(body));
    } catch {
      parts.push(String(body));
    }
  }

  return parts.join("\n");
}
