import { fetchCrusadeDataFromLoki, fetchLeaderboardDataFromLoki, fetchPlayerDataFromLoki } from "./loki-client";
import { recordSighting } from "./track";
import { renderInsightsPage } from "./insights";

interface Env {
  DB: D1Database;
}

interface RequestBody {
  environment: string;
  userId: string;
  clientSecret: string;
  snowId?: string;
}

interface LeaderboardRequestBody extends RequestBody {
  leaderboardIds: string[];
}

interface TrackRequestBody {
  userHash: string;
}

// Cloudflare serves a matching file out of the [assets] directory before this Worker ever runs
// (the default when both `main` and `[assets]` are configured), so this only needs to handle the
// routes that aren't static files - everything else falling through here is a genuine 404.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/fetch-player-data" && request.method === "POST") {
      const body = (await request.json()) as RequestBody;
      try {
        const data = await fetchPlayerDataFromLoki(
          body.environment,
          body.userId,
          body.clientSecret,
          body.snowId ?? "",
        );
        return Response.json(data);
      } catch (error) {
        return Response.json({ error: `${error}` }, { status: 502 });
      }
    }

    if (url.pathname === "/api/fetch-crusade-data" && request.method === "POST") {
      const body = (await request.json()) as RequestBody;
      try {
        const data = await fetchCrusadeDataFromLoki(body.environment, body.userId, body.clientSecret, body.snowId ?? "");
        return Response.json(data);
      } catch (error) {
        return Response.json({ error: `${error}` }, { status: 502 });
      }
    }

    if (url.pathname === "/api/fetch-leaderboard-data" && request.method === "POST") {
      const body = (await request.json()) as LeaderboardRequestBody;
      try {
        const data = await fetchLeaderboardDataFromLoki(
          body.environment,
          body.userId,
          body.clientSecret,
          body.snowId ?? "",
          body.leaderboardIds,
        );
        return Response.json(data);
      } catch (error) {
        return Response.json({ error: `${error}` }, { status: 502 });
      }
    }

    if (url.pathname === "/api/track" && request.method === "POST") {
      const body = (await request.json()) as TrackRequestBody;
      ctx.waitUntil(recordSighting(env.DB, body.userHash));
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/insights" && request.method === "GET") {
      return renderInsightsPage(env.DB);
    }

    return new Response("Not found", { status: 404 });
  },
};
