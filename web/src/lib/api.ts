import type { ProblemDetail } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/v1";
const TOKEN_STORAGE_KEY = "pharmaboard.access_token";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(problem: ProblemDetail) {
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.code = problem.code;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

/**
 * apiFetch is the single seam every feature's api.ts goes through. It
 * centralizes auth header injection and RFC 9457 problem-details parsing so
 * no call site has to know the error response shape.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json") ? await response.json() : undefined;

  if (!response.ok) {
    if (payload && typeof payload === "object" && "status" in payload) {
      throw new ApiError(payload as ProblemDetail);
    }
    throw new ApiError({
      type: "about:blank",
      title: response.statusText || "Request failed",
      status: response.status,
    });
  }

  return payload as T;
}
