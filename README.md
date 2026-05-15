# Cloudflare Stock Analysis MCP Server

This is an MCP (Model Context Protocol) Server deployed on Cloudflare Workers. It provides tools for technical stock analysis (via Yahoo Finance).

## Features
- **Stock Analysis**: Analyzes Indian stocks to find buy opportunities based on technical indicators (RSI, EMA 20/50, Supertrend).

## Connecting via Claude Desktop / Antigravity

Since this MCP server is hosted remotely on Cloudflare and uses SSE (Server-Sent Events) over HTTPS, you will need to use an NPM bridge to connect standard `stdio`-based MCP clients (like Claude Desktop or Antigravity) to it.

Add the following configuration to your `claude_desktop_config.json` (or `mcp_config.json`):

```json
{
  "mcpServers": {
    "stock-mcp": {
      "type": "streamable-http",
      "url": "https://stock-mcp.durgadas.in/mcp"
    }
  }
}
```

*(Note: Replace `https://stock.mcp.durgadas.in/mcp` with your own Cloudflare Worker URL if you deploy your own instance.)*

