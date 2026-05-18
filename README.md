# Cloudflare Stock Analysis MCP Server

This is an MCP (Model Context Protocol) Server deployed on Cloudflare Workers. It provides tools for technical stock analysis (via Yahoo Finance).

## Features
- **Stock Analysis**: Analyzes Indian stocks to find buy opportunities based on technical indicators (RSI, EMA 20/50, Supertrend).
- **Watchlist Manager**: Exposes standard watchlists for ETFs, IT, Banking, and Energy sectors to streamline multi-sector scanning.

## Exposed Tools

The server exposes the following tools:
1. **`analyze_stock`**: Fetches and evaluates full technical indicators (RSI, EMAs, Supertrend, ADX, MACD, Bollinger Bands, Volume SMA) for a single ticker.
2. **`analyze_multiple_stocks`**: Batch processes analysis for a list of tickers.
3. **`find_buy_opportunities`**: Scans a custom or default watchlist of tickers to find matching buy signals based on configurable filters (EMA crossover, RSI oversold, volume surge, etc.).
4. **`get_watchlist`**: Retrieves lists of stock/ETF symbols for a given sector or category.
    *   **Parameters**: `category` (enum: `"ETF"`, `"IT"`, `"BANK"`, `"ENERGY"`, `"POTENTIAL"`, `"MUTUAL_FUND"`, `"ALL"`). Default is `"ETF"`.
    *   **Categories**:
        *   `ETF`: Multi-asset index and commodity tracking ETFs (`NIFTYBEES.NS`, `GOLDBEES.NS`, etc.)
        *   `IT`: Sector-focused IT ETFs and major IT stocks (`ITBEES.NS`, `TCS.NS`, `INFY.NS`, etc.)
        *   `BANK`: Banking sector ETFs and major private/public banks (`BANKBEES.NS`, `HDFCBANK.NS`, `SBIN.NS`, etc.)
        *   `ENERGY`: Energy/utility sector ETFs and major corporations (`CPSEETF.NS`, `RELIANCE.NS`, `NTPC.NS`, etc.)
        *   `POTENTIAL`: Highly active, structural growth stocks under the radar (`HFCL.NS`, `KPITTECH.NS`, `MAZDOCK.NS`, `RVNL.NS`, `CDSL.NS`, `IREDA.NS`)
        *   `MUTUAL_FUND`: A high-conviction mutual fund watchlist containing 9 major direct growth schemes matched directly from active holdings.
5. **`analyze_mutual_fund`**: Evaluates trailing performance and risk ratios (Sharpe, Sortino, volatility) for an Indian Mutual Fund from daily NAV sequences.
    *   **Parameters**: `scheme_code` (number, optional). If omitted, the tool automatically scans and evaluates the entire high-conviction **MUTUAL_FUND** watchlist in parallel!
6. **`search_mutual_funds`**: Searches the active AMFI mutual fund registry in real-time. Matches wildcard queries against names, scheme codes, or ISINs, returning exact pairing data (Scheme Name, Scheme Code, Growth ISIN, Reinvestment ISIN).
    *   **Parameters**: `query` (string, required). Wildcard search query (e.g. fund house like `"Mirae"`, `"Parag Parikh"`, `"Zerodha"` or ISIN growth code).
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

## 🌾 Mutual Fund Analytics & Risk Metrics

Evaluating Mutual Funds (MFs) programmatically differs significantly from evaluating individual equities. Instead of technical trading signals (RSI, Bollinger Bands, Volume surges), mutual funds are evaluated based on **risk-adjusted performance metrics, historical rolling returns, and downside volatility protection**.

The server exposes a new tool specifically for this:
*   **`analyze_mutual_fund`**: Fetches complete historical daily NAV details for any Indian Mutual Fund via the open AMFI API and computes standard rolling performance, annualized volatility, and risk ratios.
    *   **Parameters**:
        *   `scheme_code` (number, required): The unique AMFI mutual fund scheme code (e.g., `119819` for SBI Contra Fund Direct Growth).
        *   `risk_free_rate` (number, optional): Annualized risk-free rate in percentage (defaults to `6.5` representing standard Indian G-Sec yields).

---

### 📈 Trailing & Compounded Returns
Unlike individual stocks where only latest price changes are analyzed, mutual funds are assessed over multiple standardized time horizons to determine consistency:
*   **Trailing Returns (1M, 3M, 6M)**: Compares the latest NAV against the NAV exactly 30, 90, or 180 days ago. Expressed as **Absolute Returns** as they represent short-term gains.
*   **Compounded Annualized Growth Rate (1Y, 3Y, 5Y CAGR)**: Standardizes rolling compound growth over long-term periods. It calculates the exact fractional year count ($Y$) between the target past NAV and latest NAV, and computes:
    $$\text{CAGR} = \left( \frac{\text{NAV}_{\text{latest}}}{\text{NAV}_{\text{past}}} \right)^{\frac{1}{Y}} - 1$$

---

### 🛡️ Volatility & Risk-Adjusted Indicators
Return percentages alone do not tell the whole story. A fund that gains $15\%$ with wild $25\%$ swings is often less desirable than a fund that gains $14\%$ with a smooth $8\%$ volatility. To quantify this, the server calculates:

1.  **Annualized Volatility (Standard Deviation - $\sigma$)**:
    *   **What it is**: The standard deviation of the daily NAV returns over the last 1 year ($250$ trading days).
    *   **Formula**: Multiplies daily log standard deviation by $\sqrt{250}$ to annualize it, expressed as a percentage.
    *   **What it means**: Represents the overall dispersion or price swings of the fund. Lower volatility means steadier, smoother NAV growth.

2.  **Annualized Downside Volatility**:
    *   **What it is**: The standard deviation calculated by replacing all positive daily returns with $0$.
    *   **What it means**: Measures only the *negative* or "bad" volatility (market drops). It does not penalize a fund manager for large *upward* price movements.

3.  **Sharpe Ratio**:
    *   **What it is**: The standard measure of risk-adjusted return (excess return earned per unit of total volatility).
    *   **Formula**:
        $$\text{Sharpe} = \frac{\text{Trailing 1Y CAGR} - \text{Risk Free Rate}}{\text{Annualized Volatility}}$$
    *   **What it means**: Tells you whether the fund's outperformance is a result of smart asset selection or simply taking excess risk.
        *   *Sharpe > 1.0*: Good (the excess return justifies the volatility).
        *   *Sharpe > 1.5*: Excellent (highly efficient fund management).
        *   *Sharpe < 0.2*: Poor (fails to generate sufficient returns relative to the risk taken).

4.  **Sortino Ratio**:
    *   **What it is**: A refined version of the Sharpe ratio that only considers downside/negative volatility in the denominator.
    *   **Formula**:
        $$\text{Sortino} = \frac{\text{Trailing 1Y CAGR} - \text{Risk Free Rate}}{\text{Annualized Downside Volatility}}$$
    *   **What it means**: Particularly valuable for evaluating equity/mid-cap funds. If a fund has a high Sharpe but a low Sortino, it means its downward swings are highly severe. A high Sortino indicates superb capital preservation in down markets.

---

### 🏆 Evaluation Grading Scale
Based on the calculated indicators, the server assigns a dynamic performance Grade:

| Grade | Criteria | Actionable Translation |
| :--- | :--- | :--- |
| **EXCELLENT** | Sharpe Ratio > 1.5 & 1Y Return > 15% | **Top Tier Outperformer**: Outstanding risk-adjusted return; highly efficient fund management. |
| **GOOD** | Sharpe Ratio > 0.8 or 1Y Return > 12% | **High Performer**: Consistent returns with controlled, healthy volatility levels. |
| **AVERAGE** | Sharpe Ratio >= 0.2 or 1Y Return > 6% | **Stable/Inline**: Solid middle-of-the-pack performance, typically matching standard index averages. |
| **POOR** | Sharpe Ratio < 0.2 | **Underperformer**: Low returns or excess volatility that is not financially justified. |

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Run local development server |
| `npm run deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

