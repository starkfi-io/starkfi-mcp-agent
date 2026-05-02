import { formatApiError } from "./errors.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type QueryValue = string | number | boolean | undefined | null;

export class StarkFiHttpClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async requestJson<T>(
    method: HttpMethod,
    path: string,
    options?: {
      query?: Record<string, QueryValue>;
      body?: unknown;
    },
  ): Promise<T> {
    const url = new URL(
      path.startsWith("/") ? path : `/${path}`,
      `${this.baseUrl.replace(/\/+$/, "")}/`,
    );

    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      Accept: "application/json",
    };

    let body: string | undefined;
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    let res: Response;
    try {
      res = await fetch(url, { method, headers, body });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Request to ${url.href} failed before response: ${msg}`);
    }

    const text = await res.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      throw new Error(formatApiError(res.status, res.statusText, parsed));
    }

    return parsed as T;
  }
}
