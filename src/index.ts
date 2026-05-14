import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { callable } from "agents";
import { z } from "zod";
import { fetchStockData } from "./indicators";
import { placeKiteOrder, getKiteHoldings, kiteLogin } from "./kite-client";
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

    // place_order_for_stock
    this.server.tool(
      "place_order_for_stock",
      {
        symbol: z.string(),
        quantity: z.number().optional(),
        amount: z.number().optional(),
        order_type: z.string().default("MARKET"),
        product: z.string().default("CNC"),
      },
      async ({ symbol, quantity, amount, order_type, product }) => {
        if (!quantity && !amount) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "Either quantity or amount must be provided" }) }],
          };
        }

        let orderQty = quantity || 0;

        if (amount) {
          const data = await fetchStockData(symbol);
          if (data.status === "error") {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `Failed to fetch data: ${data.error}` }) }],
            };
          }
          orderQty = Math.floor(amount / data.ltp);
          if (orderQty === 0) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `Amount ${amount} is too small. LTP is ${data.ltp}` }) }],
            };
          }
        }

        const result = await placeKiteOrder(symbol, orderQty, order_type, product);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    // place_orders_for_opportunities
    this.server.tool(
      "place_orders_for_opportunities",
      {
        total_amount: z.number().default(1000.0),
        symbols: z.array(z.string()).optional(),
        min_fall_pct: z.number().default(-2.0),
        min_rsi: z.number().default(50),
        require_st_green: z.boolean().default(true),
        order_type: z.string().default("MARKET"),
        product: z.string().default("CNC"),
      },
      async ({ total_amount, symbols, min_fall_pct, min_rsi, require_st_green, order_type, product }) => {
        if (total_amount >= 2500) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "approval_required",
                  message: `⚠️ Investment amount of ₹${total_amount} requires approval`,
                  details: {
                    total_amount,
                    threshold: 2500,
                    reason: "Amount is ₹2,500 or above",
                    action_required: "Please use confirm_and_place_orders tool to proceed",
                  },
                }, null, 2),
              },
            ],
          };
        }

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

        if (candidates.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "no_opportunities",
                  message: "No buy opportunities found matching the criteria",
                }),
              },
            ],
          };
        }

        const amountPerStock = total_amount / candidates.length;
        const orderResults = [];

        for (const candidate of candidates) {
          const orderQty = Math.floor(amountPerStock / candidate.ltp);
          if (orderQty > 0) {
            const orderResult = await placeKiteOrder(candidate.symbol, orderQty, order_type, product);
            orderResults.push({
              stock_analysis: candidate,
              order_result: orderResult,
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                total_amount,
                amount_per_stock: Number(amountPerStock.toFixed(2)),
                opportunities_count: candidates.length,
                orders: orderResults,
              }, null, 2),
            },
          ],
        };
      }
    );

    // confirm_and_place_orders
    this.server.tool(
      "confirm_and_place_orders",
      {
        total_amount: z.number(),
        symbols: z.array(z.string()).optional(),
        min_fall_pct: z.number().default(-2.0),
        min_rsi: z.number().default(50),
        require_st_green: z.boolean().default(true),
        order_type: z.string().default("MARKET"),
        product: z.string().default("CNC"),
      },
      async ({ total_amount, symbols, min_fall_pct, min_rsi, require_st_green, order_type, product }) => {
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

        if (candidates.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "no_opportunities",
                  message: "No buy opportunities found matching the criteria",
                }),
              },
            ],
          };
        }

        const amountPerStock = total_amount / candidates.length;
        const orderResults = [];

        for (const candidate of candidates) {
          const orderQty = Math.floor(amountPerStock / candidate.ltp);
          if (orderQty > 0) {
            const orderResult = await placeKiteOrder(candidate.symbol, orderQty, order_type, product);
            orderResults.push({
              stock_analysis: candidate,
              order_result: orderResult,
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                total_amount,
                amount_per_stock: Number(amountPerStock.toFixed(2)),
                opportunities_count: candidates.length,
                orders: orderResults,
              }, null, 2),
            },
          ],
        };
      }
    );

    // get_kite_holdings
    this.server.tool(
      "get_kite_holdings",
      {},
      async () => {
        const result = await getKiteHoldings();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    // kite_login
    this.server.tool(
      "kite_login",
      {},
      async () => {
        const result = await kiteLogin();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
