import type { ContentfulStatusCode } from "hono/utils/http-status";

/** API で返す「想定内のエラー」 */
export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "ログインが必要です") => new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "この操作をする権限がありません") => new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "見つかりません") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new HttpError(409, "CONFLICT", message);
export const tooMany = (message = "操作が多すぎます。少し待ってから再度お試しください") =>
  new HttpError(429, "RATE_LIMITED", message);
export const unavailable = (message: string) => new HttpError(503, "UNAVAILABLE", message);
