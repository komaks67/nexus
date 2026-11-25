import type { ApiErrorBody } from "@nexus/shared";
import { API_BASE } from "./config";

/** API から返ってきたエラー（画面に出すメッセージとコードを持つ） */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "nexus.token";
let token: string | null = localStorage.getItem(TOKEN_KEY);
let onUnauthorized: (() => void) | null = null;

export function getToken(): string | null {
  return token;
}
export function setToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
/** 401 を受け取ったとき（ログイン切れ）の処理を登録 */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return `${API_BASE}${path}${s ? `?${s}` : ""}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = "HTTP_" + res.status;
  let message = `通信エラーが発生しました（${res.status}）`;
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body.error) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    // JSON でないエラー本文は無視
  }
  return new ApiError(res.status, code, message);
}

/** fetch の薄いラッパー。認証ヘッダー付与・エラー変換を共通化 */
export async function rawRequest(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", "サーバーに接続できません。ネットワークを確認してください");
  }
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "不明なエラーが発生しました";
}
