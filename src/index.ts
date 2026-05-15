import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { callable } from "agents";
import { z } from "zod";
import { fetchStockData } from "./indicators";
import { LANDING_PAGE } from "./landing-page";

const DEFAULT_WATCHLIST = [
  "INFRABEES.NS",
  "PSUBNKBEES.NS",
  "NIFTYBEES.NS",
  "GOLDBEES.NS",
  "SILVER1.NS",
  "CPSEETF.NS",
  "ITBEES.NS",
];

export class StockMCP extends McpAgent {
  server = new McpServer({
    name: "stock-analysis-server",
    version: "1.0.0",
  });

  async init() {
    // analyze_etf (now generic for stocks)
    this.server.tool(
      "analyze_stock",
      { symbol: z.string() },
      async ({ symbol }) => {
        const result = await fetchStockData(symbol);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    // analyze_multiple_stocks
    this.server.tool(
      "analyze_multiple_stocks",
      { symbols: z.array(z.string()) },
      async ({ symbols }) => {
        const results = [];
        for (const sym of symbols) {
          results.push(await fetchStockData(sym));
        }
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }
    );

    // find_buy_opportunities
    this.server.tool(
      "find_buy_opportunities",
      {
        symbols: z.array(z.string()).optional(),
        min_fall_pct: z.number().default(-2.0),
        min_rsi: z.number().default(50),
        require_st_green: z.boolean().default(true),
      },
      async ({ symbols, min_fall_pct, min_rsi, require_st_green }) => {
        const targetSymbols = symbols || DEFAULT_WATCHLIST;
        const candidates = [];

        for (const sym of targetSymbols) {
          const result = await fetchStockData(sym);
          if (result.status === "error") continue;

          const meetsCriteria =
            result.price_above_ema20 &&
            result.price_above_ema50 &&
            result.rsi > min_rsi &&
            (!require_st_green || result.is_st_green) &&
            result.fall_pct <= min_fall_pct;

          if (meetsCriteria) {
            candidates.push(result);
          }
        }

        candidates.sort((a, b) => a.fall_pct - b.fall_pct);

        const response = {
          opportunities: candidates,
          count: candidates.length,
          criteria: {
            min_fall_pct,
            min_rsi,
            require_st_green,
          },
        };

        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      }
    );


  }

  @callable()
  async cleanup() {
    console.log("Starting daily database cleanup...");
    // This removes all persistent state, including SQLite tables
    await this.ctx.storage.deleteAll();
    console.log("Database cleanup complete.");
  }
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/mcp")) {
      const accept = request.headers.get("accept") || "";
      const isBrowser = request.method === "GET" && accept.includes("text/html");

      if (isBrowser) {
        return new Response(LANDING_PAGE(url.origin + "/mcp"), {
          headers: { "Content-Type": "text/html" },
        });
      }

      return StockMCP.serve("/mcp", {
        binding: "MCP_OBJECT",
        transport: "streamable-http",
      }).fetch(request, env, ctx);
    }

    return new Response("Not found. Use /mcp for the MCP server.", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext) {
    console.log("Running scheduled cleanup...");
    const id = env.MCP_OBJECT.idFromName("default");
    const agent = env.MCP_OBJECT.get(id);
    await agent.cleanup();
  },
};
