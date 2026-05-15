# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

## Best Practices (conditional)

If the application uses Durable Objects or Workflows, refer to the relevant best practices:

- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/

## MCP & Agents SDK Learnings

- **McpAgent Durable Object Binding**: When extending `McpAgent` from the `@cloudflare/agents` SDK, you must configure a Durable Object binding named `MCP_OBJECT` pointing to your agent class in `wrangler.jsonc`, and include it in `new_sqlite_classes` for migrations.
- **Node Built-ins in CF Workers**: Dependencies (like `yahoo-finance2` or `@deno/shim-deno`) may attempt to use Node globals like `__dirname`. Fix `__dirname is not defined` errors by injecting it via esbuild in `wrangler.jsonc`:
  ```jsonc
  "define": { "__dirname": "\"\"", "__filename": "\"\"" }
  ```


## Technical Analysis Strategy

This MCP server implements a high-conviction technical analysis strategy. Agents should prioritize the `recommendation` and `is_buy_signal` fields for automated decisions, while using the `comment` field for synthesis and reporting.

### Key Indicator Thresholds
- **EMA 20/50 Crossover**: A `true` value for `is_ema_bullish_crossover` is a high-conviction "Trend Reversal" signal. It marks the shift from a neutral/bearish state to a bullish momentum phase.
- **ADX**: Values above 25 indicate a strong trend. Agents should favor trend-following strategies here.
- **RSI**: Values < 30 are "Deep Value" signals; > 70 are "Exit/Avoid" signals.
- **Volume Surge**: A `true` value indicates a 50% increase over the 20-day average, signaling institutional/high-conviction interest.
- **Bollinger Bands**: Touching the lower band (`is_near_bb_lower: true`) is a high-probability mean-reversion entry point in bullish trends.

### Analysis Philosophy
The server is designed to find **"Apt Recommendations"** by default. Tools like `find_buy_opportunities` use strict high-conviction filters (EMA Crossover or MACD Bullish + Volume Surge + ADX Strength) to minimize false positives. Priority should be given to stocks that show a fresh EMA 20/50 crossover as they represent the highest potential for an early trend entry.

### Automated Decision Making
- **Triggering Notifications/Orders**: Agents should monitor the `is_buy_signal` field. If `true`, it indicates a high-probability entry point.
- **Profit Taking**: The `target_sell_price` should be used to set limit orders or GTT (Good Till Triggered) targets.
- **Risk Management**: If `recommendation` shifts to `SELL`, agents should advise an immediate exit to protect capital.
