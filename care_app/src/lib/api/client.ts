import type { AuthTokens } from "@/lib/types";

const TOKEN_KEY = "smritisetu_tokens";
const USER_KEY = "smritisetu_user";

export function getStoredTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

export function setStoredTokens(tokens: AuthTokens | null): void {
  if (typeof window === "undefined") return;
  if (!tokens) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function getStoredUserJson(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_KEY);
}

export function setStoredUserJson(json: string | null): void {
  if (typeof window === "undefined") return;
  if (!json) localStorage.removeItem(USER_KEY);
  else localStorage.setItem(USER_KEY, json);
}

export function mocksEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_USE_MOCKS;
  return flag !== "false";
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

/** Every real route lives under this prefix; health and docs endpoints do not, but this client never calls those. */
const API_BASE_PATH = "/api/v1";

export class ApiClientError extends Error {
  code: string;
  status: number;
  correlationId?: string;

  constructor(
    message: string,
    code: string,
    status: number,
    correlationId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.correlationId = correlationId;
  }
}

function correlationId(): string {
  return `web_${Math.random().toString(36).slice(2, 10)}`;
}

export async function httpRequest<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const cid = correlationId();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Correlation-Id", cid);
  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${API_BASE_PATH}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiClientError(
      "Unable to reach the server. Check your connection.",
      "NETWORK_ERROR",
      0,
      cid,
    );
  }

  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = response.statusText || "Request failed";
    let correlationId: string | undefined = cid;
    try {
      // The backend nests error details under `error`, not at the top level.
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; requestId?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
      correlationId = body.error?.requestId ?? cid;
    } catch {
      // ignore parse errors
    }
    throw new ApiClientError(message, code, response.status, correlationId);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  // Every success response is `{ data, requestId }`.
  const envelope = (await response.json()) as { data: T; requestId: string };
  return envelope.data;
}
