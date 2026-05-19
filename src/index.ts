import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { callable } from "agents";
import { z } from "zod";
import { fetchStockData } from "./indicators";
import { fetchMutualFundData, searchMutualFundsAMFI } from "./mf-indicators";
import { LANDING_PAGE } from "./landing-page";

const WATCHLISTS: Record<string, string[]> = {
  ETF: [
    "INFRABEES.NS",
    "PSUBNKBEES.NS",
    "NIFTYBEES.NS",
    "GOLDBEES.NS",
    "SILVER1.NS",
    "CPSEETF.NS",
    "ITBEES.NS",
  ],
  IT: [
    "ITBEES.NS",
    "TCS.NS",
    "INFY.NS",
    "WIPRO.NS",
    "HCLTECH.NS",
    "PERSISTENT.NS",
    "COFORGE.NS"
  ],
  BANK: [
    "BANKBEES.NS",
    "PSUBNKBEES.NS",
    "HDFCBANK.NS",
    "ICICIBANK.NS",
    "SBIN.NS",
  ],
  ENERGY: [
    "CPSEETF.NS",
    "RELIANCE.NS",
    "ONGC.NS",
    "NTPC.NS",
    "POWERGRID.NS",
  ],
  POTENTIAL: [
    "HFCL.NS",
    "KPITTECH.NS",
    "MAZDOCK.NS",
    "RVNL.NS",
    "CDSL.NS",
    "IREDA.NS",
  ],
  MUTUAL_FUND: [
    "149039",
    "153011",
    "120847",
    "118449",
    "151412",
    "122639",
    "152156",
    "153656",
    "153757",
  ]
};

const MF_WATCHLIST = [
  149039,
  153011,
  120847,
  118449,
  151412,
  122639,
  152156,
  153656,
  153757
];

const DEFAULT_WATCHLIST = WATCHLISTS.ETF;

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
        let cleanSymbol = symbol.toUpperCase();
        if (!cleanSymbol.includes(".")) {
          cleanSymbol += ".NS";
        }
        console.log(`[analyze_stock] Triggered for symbol: ${symbol} (formatted: ${cleanSymbol})`);
        const result = await fetchStockData(cleanSymbol);
        console.log(`[analyze_stock] Result for ${cleanSymbol}: status = ${result.status}, price = ${result.ltp}`);
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
        console.log(`[analyze_multiple_stocks] Triggered for symbols:`, symbols);
        const results = [];
        for (const sym of symbols) {
          let cleanSymbol = sym.toUpperCase();
          if (!cleanSymbol.includes(".")) {
            cleanSymbol += ".NS";
          }
          console.log(`[analyze_multiple_stocks] Evaluating ${sym} (formatted: ${cleanSymbol})...`);
          const res = await fetchStockData(cleanSymbol);
          console.log(`[analyze_multiple_stocks] Evaluated ${cleanSymbol}: price = ${res.ltp}`);
          results.push(res);
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
        watchlists: z.array(z.enum(["ETF", "IT", "BANK", "ENERGY", "POTENTIAL"])).optional(),
        min_fall_pct: z.number().default(-2.0),
        min_rsi: z.number().default(50),
        require_st_green: z.boolean().default(true),
        min_adx: z.number().default(20),
        require_volume_surge: z.boolean().default(true),
        require_macd_bullish: z.boolean().default(true),
        require_ema_crossover: z.boolean().default(false),
      },
      async ({ symbols, watchlists, min_fall_pct, min_rsi, require_st_green, min_adx, require_volume_surge, require_macd_bullish, require_ema_crossover }) => {
        let targetSymbols: string[] = [];

        // 1. Accumulate all input requests (symbols + watchlists)
        const inputs = new Set<string>();
        if (symbols && symbols.length > 0) {
          for (const s of symbols) {
            inputs.add(s);
          }
        }
        if (watchlists && watchlists.length > 0) {
          for (const wl of watchlists) {
            inputs.add(wl);
          }
        }

        // If no inputs are provided, default to ETF watchlist category
        if (inputs.size === 0) {
          inputs.add("ETF");
        }

        // 2. Expand watchlist categories and format standard tickers
        const symbolSet = new Set<string>();
        for (const item of inputs) {
          const upperItem = item.toUpperCase();
          if (upperItem in WATCHLISTS) {
            const list = WATCHLISTS[upperItem as keyof typeof WATCHLISTS];
            if (list) {
              for (const sym of list) {
                symbolSet.add(sym.toUpperCase());
              }
            }
          } else {
            let cleanSym = upperItem;
            if (!cleanSym.includes(".")) {
              cleanSym += ".NS";
            }
            symbolSet.add(cleanSym);
          }
        }
        targetSymbols = Array.from(symbolSet);

        console.log(`[find_buy_opportunities] Scanning ${targetSymbols.length} symbols with criteria:`, {
          watchlists: watchlists || ["ETF"],
          min_fall_pct,
          min_rsi,
          require_st_green,
          min_adx,
          require_volume_surge,
          require_macd_bullish,
          require_ema_crossover
        });
        const candidates = [];

        for (const sym of targetSymbols) {
          const result = await fetchStockData(sym);
          if (result.status === "error") {
            console.log(`[find_buy_opportunities] Error fetching ${sym}: ${result.error}`);
            continue;
          }

          const priceAboveEma20 = result.price_above_ema20;
          const priceAboveEma50 = result.price_above_ema50;
          const rsiOk = (result.rsi === null || result.rsi > min_rsi);
          const stOk = (!require_st_green || result.is_st_green);
          const fallOk = result.fall_pct <= min_fall_pct;
          const adxOk = (result.adx === null || result.adx >= min_adx);
          const volOk = (!require_volume_surge || result.is_volume_surge || result.volume_sma20 === null);
          const macdOk = (!require_macd_bullish || result.is_macd_bullish || result.macd === null);
          const emaCrossOk = (!require_ema_crossover || result.is_ema_bullish_crossover);

          const meetsCriteria = priceAboveEma20 && priceAboveEma50 && rsiOk && stOk && fallOk && adxOk && volOk && macdOk && emaCrossOk;

          console.log(`[find_buy_opportunities] Symbol: ${sym} | Meets Criteria: ${meetsCriteria ? "✅ YES" : "❌ NO"}`);
          console.log(`  - Price above EMA20/50: ${priceAboveEma20}/${priceAboveEma50} (Price: ${result.ltp}, EMA20: ${result.ema_20}, EMA50: ${result.ema_50})`);
          console.log(`  - Fall Pct (<= ${min_fall_pct}%): ${fallOk} (Actual: ${result.fall_pct.toFixed(2)}%)`);
          console.log(`  - RSI (> ${min_rsi}): ${rsiOk} (Actual: ${result.rsi})`);
          console.log(`  - Supertrend Green (req: ${require_st_green}): ${stOk} (Actual: ${result.is_st_green})`);
          console.log(`  - ADX (>= ${min_adx}): ${adxOk} (Actual: ${result.adx})`);
          console.log(`  - Volume Surge (req: ${require_volume_surge}): ${volOk} (Surge: ${result.is_volume_surge}, SMA20: ${result.volume_sma20})`);
          console.log(`  - MACD Bullish (req: ${require_macd_bullish}): ${macdOk} (Bullish: ${result.is_macd_bullish})`);
          console.log(`  - EMA Crossover (req: ${require_ema_crossover}): ${emaCrossOk} (Bullish: ${result.is_ema_bullish_crossover})`);

          if (meetsCriteria) {
            candidates.push(result);
          }
        }

        candidates.sort((a, b) => a.fall_pct - b.fall_pct);
        console.log(`[find_buy_opportunities] Completed scan. Found ${candidates.length} opportunities:`, candidates.map(c => c.symbol));

        const response = {
          opportunities: candidates,
          count: candidates.length,
          criteria: {
            min_fall_pct,
            min_rsi,
            require_st_green,
            min_adx,
            require_volume_surge,
            require_macd_bullish,
            require_ema_crossover,
          },
        };

        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      }
    );

    // get_watchlist
    this.server.tool(
      "get_watchlist",
      {
        category: z.enum(["ETF", "IT", "BANK", "ENERGY", "POTENTIAL", "MUTUAL_FUND", "ALL"]).default("ETF")
      },
      async ({ category }) => {
        console.log(`[get_watchlist] Triggered for category: ${category}`);
        if (category === "ALL") {
          return {
            content: [{ type: "text", text: JSON.stringify(WATCHLISTS, null, 2) }]
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ category, symbols: WATCHLISTS[category] }, null, 2) }]
        };
      }
    );

    // analyze_mutual_fund
    this.server.tool(
      "analyze_mutual_fund",
      {
        scheme_code: z.number().optional().describe("The unique AMFI mutual fund scheme code (optional, defaults to analyzing the full watchlist if omitted)"),
        risk_free_rate: z.number().default(6.5).describe("Annualized risk free rate in % for Sharpe calculation")
      },
      async ({ scheme_code, risk_free_rate }) => {
        if (scheme_code !== undefined) {
          console.log(`[analyze_mutual_fund] Triggered for scheme code: ${scheme_code}`);
          const result = await fetchMutualFundData(scheme_code, risk_free_rate);
          console.log(`[analyze_mutual_fund] Evaluation for ${scheme_code}: status = ${result.status}, grade = ${result.evaluation.grade}`);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } else {
          console.log(`[analyze_mutual_fund] No scheme code provided. Analyzing default Mutual Fund Watchlist...`);
          const results = await Promise.all(
            MF_WATCHLIST.map(async (code) => {
              try {
                return await fetchMutualFundData(code, risk_free_rate);
              } catch (e: any) {
                console.error(`Error analyzing watchlist scheme ${code}:`, e.message);
                return { scheme_code: code, status: "error", error: e.message };
              }
            })
          );
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        }
      }
    );

    // search_mutual_funds
    this.server.tool(
      "search_mutual_funds",
      {
        query: z.string().describe("Wildcard search query (e.g. fund house like 'Mirae', 'Parag Parikh', 'Zerodha', or scheme name/ISIN)")
      },
      async ({ query }) => {
        console.log(`[search_mutual_funds] Triggered search for query: "${query}"`);
        const results = await searchMutualFundsAMFI(query);
        console.log(`[search_mutual_funds] Found ${results.length} matching mutual funds`);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
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
