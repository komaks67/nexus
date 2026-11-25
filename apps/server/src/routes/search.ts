import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { searchQuerySchema, type SearchResponse } from "@nexus/shared";
import { getUserServerIds, requireChannelAccess, requireMember } from "../lib/access.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { unavailable } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { validationHook } from "../lib/validation.js";
import { searchMessages } from "../services/search.js";
import type { AppEnv } from "../types.js";

export const searchRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/search", zValidator("query", searchQuerySchema, validationHook), async (c) => {
    const user = c.get("user");
    await rateLimit(`search:${user.id}`, 30, 10);
    const q = c.req.valid("query");

    let allowedServerIds: string[];
    if (q.channelId) {
      const { channel } = await requireChannelAccess(q.channelId, user.id);
      allowedServerIds = [channel.serverId];
    } else if (q.serverId) {
      await requireMember(q.serverId, user.id);
      allowedServerIds = [q.serverId];
    } else {
      allowedServerIds = await getUserServerIds(user.id);
    }

    try {
      const result = await searchMessages({
        q: q.q,
        allowedServerIds,
        channelId: q.channelId,
        authorId: q.authorId,
        hasFile: q.hasFile === undefined ? undefined : q.hasFile === "true",
        limit: q.limit,
        offset: q.offset,
      });
      return c.json<SearchResponse>(result);
    } catch (err) {
      console.error("[search]", err);
      throw unavailable("検索サーバーに接続できません。しばらくしてからお試しください");
    }
  });
