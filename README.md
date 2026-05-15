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

## Technical Indicators & Strategy

The server uses a multi-layered technical analysis strategy to evaluate stocks and generate recommendations.

### Core Trend Indicators
- **EMA (20 & 50)**: Exponential Moving Averages. Price above both indicates a bullish trend.
- **EMA 20/50 Crossover**: A "Golden Cross" (20 crossing above 50) signals the **start of a medium-term uptrend**. It is a momentum shift indicator that confirms recent price strength is overtaking the historical trend.
- **Supertrend (10, 3)**: A volatility-based trend following indicator. "Green" indicates an active uptrend.
- **ADX (14)**: Average Directional Index. Measures trend strength.
    - **ADX > 20**: The market is starting to trend.
    - **ADX > 25**: Strong trending market (ideal for trend-following).

### Momentum & Volatility
- **RSI (14)**: Relative Strength Index.
    - **< 30**: Oversold (Potential mean reversion).
    - **> 70**: Overbought (Potential exhaustion).
    - **50-60**: Healthy momentum in an uptrend.
- **MACD (12, 26, 9)**: Moving Average Convergence Divergence.
    - **Bullish Crossover**: MACD line crosses above the Signal line (Positive momentum shift).
- **Bollinger Bands (20, 2)**:
    - **Lower Band**: Price touching or near the lower band indicates an oversold extreme in the current volatility window.

### Volume Analysis
- **Volume SMA (20)**: Compares current volume to the 20-day average.
- **Volume Surge**: Triggered when volume is **> 1.5x (50% increase)** the average. High volume confirms the conviction of a price move.

---

## Recommendation Logic

The server generates a `comment` field by weighing the evidence across all indicators:

| Recommendation | Criteria |
| :--- | :--- |
| **Strong Buy (High Conviction)** | Strong Bullish trend + (Dip or BB Lower) + (Volume Surge or MACD Bullish) |
| **Great Buy on Dips** | Strong Bullish trend + Price Dip (`fall_pct` <= -1.5%) |
| **Trend-Start Entry** | EMA 20/50 Bullish Crossover (`is_ema_bullish_crossover`: true) |
| **Trend-Following Entry** | Strong Bullish trend + MACD Bullish crossover |
| **Momentum Buy** | Bullish trend + MACD Bullish crossover |
| **Deep Value Buy** | RSI Oversold (<30) + Near Bollinger Lower Band |
| **Avoid (Overbought)** | RSI Overbought (>70) |
| **Sell / Exit** | Bearish trend (Price < EMA 20 & 50) |

### Structured Output & Decision Support
In addition to the human-readable `comment`, the API returns programmatic fields to support automated trading or dashboard integrations:

- **`recommendation`**: 
    - `BUY`: Technical conditions favor an entry (e.g., EMA Crossover, MACD Bullish, or Dip in a Strong Uptrend).
    - `HOLD`: Trend is stable (Strong Bullish) but no fresh entry point is available, or the market is Neutral.
    - `SELL`: Technical breakdown or exhaustion (Bearish trend or RSI > 70).
- **`is_buy_signal`**: A high-conviction boolean. Set to `true` only when the system detects a fresh `BUY` recommendation.
- **`target_sell_price`**: A dynamically calculated profit target.
    - **Logic**: It looks at the **Upper Bollinger Band** (resistance) first. If the price is near or above it, it defaults to a **+5% gain** from the current price. 
    - *Note: This field is `null` for `SELL` recommendations.*

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Run local development server |
| `npm run deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

