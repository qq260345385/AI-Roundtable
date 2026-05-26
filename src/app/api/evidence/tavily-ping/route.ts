import { NextResponse } from "next/server";
import {
  DEFAULT_TAVILY_PING_QUERY,
  normalizePingQuery,
  runTavilyPing,
} from "../../../../lib/search/tavily-ping";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = normalizePingQuery(
    url.searchParams.get("q") ?? DEFAULT_TAVILY_PING_QUERY,
  );
  const result = await runTavilyPing({
    failedStage: "tavily_ping",
    query,
    signal: request.signal,
  });

  return NextResponse.json(result, { status: result.statusCode });
}
