# Cloudflare Stock & Kite MCP Server

This is an MCP (Model Context Protocol) Server deployed on Cloudflare Workers. It provides tools for technical stock analysis (via Yahoo Finance) and live trading capabilities using the Zerodha Kite API.

## Features
- **Stock Analysis**: Analyzes Indian stocks to find buy opportunities based on technical indicators (RSI, EMA 20/50, Supertrend).
- **Kite Trading Integration**: Fetch your current holdings and place market/limit orders directly via Kite.

## Connecting via Claude Desktop / Antigravity

Since this MCP server is hosted remotely on Cloudflare and uses SSE (Server-Sent Events) over HTTPS, you will need to use an NPM bridge to connect standard `stdio`-based MCP clients (like Claude Desktop or Antigravity) to it.

Add the following configuration to your `claude_desktop_config.json` (or `mcp_config.json`):

```json
{
  "mcpServers": {
    "stock-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://stock.mcp.durgadas.in/mcp"
      ]
    }
  }
}
```

*(Note: Replace `https://stock.mcp.durgadas.in/mcp` with your own Cloudflare Worker URL if you deploy your own instance.)*

## Authentication

The Kite API requires session authentication. When you first spin up your MCP client:
1. Call the `kite_login` tool.
2. The tool will return a secure authorization link.
3. Click the link to log in to your Kite account.
4. Once authenticated, the active session is established, and you can freely use the order placement and portfolio analysis tools!
