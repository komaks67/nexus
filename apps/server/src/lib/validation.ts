import type { Context } from "hono";
import type { core } from "zod";
import { badRequest } from "./errors.js";

/** zValidator の失敗時に、統一したエラー形式で返すためのフック */
export const validationHook = (
  result: { success: true } | { success: false; error: core.$ZodError },
  _c: Context,
): void => {
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.map(String).join(".") ?? "";
    throw badRequest(`${field ? `${field}: ` : ""}${first?.message ?? "入力が正しくありません"}`, result.error.issues);
  }
};
