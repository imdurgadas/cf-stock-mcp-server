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
- **Kite MCP Integration**:
  - Kite MCP tools can be called via HTTP POST to `https://mcp.kite.trade/mcp` (using standard JSON-RPC formatting), which is highly compatible with Cloudflare Workers' native `fetch`.
  - Kite MCP requires authentication. You must expose or call the `login` tool to generate an authorization link for the user, otherwise tools like `get_holdings` or `place_order` will return a `400 Bad Request` or "Invalid session ID".
