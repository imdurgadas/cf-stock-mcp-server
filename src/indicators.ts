import { RSI, EMA, ATR } from 'technicalindicators';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export interface StockDataResult {
  symbol: string;
  ltp: number;
  prev_close: number;
  fall_pct: number;
  rsi: number;
  ema_20: number;
  ema_50: number;
  price_above_ema20: boolean;
  price_above_ema50: boolean;
  is_st_green: boolean;
  status: string;
  error?: string;
}

export async function fetchStockData(rawSymbol: string): Promise<StockDataResult> {
  // Ensure we query Indian stocks by default if no exchange suffix is provided
  const symbol = rawSymbol.includes('.') ? rawSymbol : `${rawSymbol}.NS`;

  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 100); // 100 days of data to ensure we have enough for EMA 50

    const queryOptions = {
      period1: start,
      period2: end,
      interval: '1d' as const,
    };

    const result = await yahooFinance.historical(symbol, queryOptions) as any[];

    if (!result || result.length === 0) {
      throw new Error(`No data available for ${symbol}`);
    }

    const closes = result.map((r: any) => r.close);
    const highs = result.map((r: any) => r.high);
    const lows = result.map((r: any) => r.low);

    if (closes.length < 50) {
      throw new Error(`Not enough data for ${symbol} to calculate indicators`);
    }

    const ltp = closes[closes.length - 1];
    const prev_close = closes[closes.length - 2];
    const fall_pct = ((ltp - prev_close) / prev_close) * 100;

    // Calculate RSI (14)
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const currentRsi = rsiValues[rsiValues.length - 1];

    // Calculate EMAs
    const ema20Values = EMA.calculate({ values: closes, period: 20 });
    const ema50Values = EMA.calculate({ values: closes, period: 50 });
    const currentEma20 = ema20Values[ema20Values.length - 1];
    const currentEma50 = ema50Values[ema50Values.length - 1];

    // Calculate Supertrend (10, 3)
    const isStGreen = calculateSupertrend(highs, lows, closes, 10, 3);

    return {
      symbol,
      ltp: Number(ltp.toFixed(2)),
      prev_close: Number(prev_close.toFixed(2)),
      fall_pct: Number(fall_pct.toFixed(2)),
      rsi: Number(currentRsi.toFixed(2)),
      ema_20: Number(currentEma20.toFixed(2)),
      ema_50: Number(currentEma50.toFixed(2)),
      price_above_ema20: ltp > currentEma20,
      price_above_ema50: ltp > currentEma50,
      is_st_green: isStGreen,
      status: 'success',
    };
  } catch (error: any) {
    return {
      symbol,
      ltp: 0,
      prev_close: 0,
      fall_pct: 0,
      rsi: 0,
      ema_20: 0,
      ema_50: 0,
      price_above_ema20: false,
      price_above_ema50: false,
      is_st_green: false,
      status: 'error',
      error: error.message || String(error),
    };
  }
}

function calculateSupertrend(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
  multiplier: number
): boolean {
  if (highs.length < period) return false;

  const atrInput = {
    high: highs,
    low: lows,
    close: closes,
    period: period,
  };
  
  const atrValues = ATR.calculate(atrInput);
  
  // ATR array length will be highs.length - period
  // Let's align arrays. For supertrend, we need ATR corresponding to the current bar.
  
  let finalUpperBands: number[] = [];
  let finalLowerBands: number[] = [];
  let supertrends: number[] = [];
  let trends: number[] = []; // 1 for uptrend, -1 for downtrend
  
  const startIndex = period;
  
  for (let i = startIndex; i < highs.length; i++) {
    const atrIdx = i - period;
    if (atrIdx >= atrValues.length) break;
    
    const atr = atrValues[atrIdx];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const prevClose = closes[i - 1];
    
    const basicUpperBand = (high + low) / 2 + multiplier * atr;
    const basicLowerBand = (high + low) / 2 - multiplier * atr;
    
    let finalUpperBand = basicUpperBand;
    let finalLowerBand = basicLowerBand;
    
    if (i === startIndex) {
      finalUpperBands.push(finalUpperBand);
      finalLowerBands.push(finalLowerBand);
      supertrends.push(finalUpperBand);
      trends.push(-1);
      continue;
    }
    
    const prevFinalUpperBand = finalUpperBands[finalUpperBands.length - 1];
    const prevFinalLowerBand = finalLowerBands[finalLowerBands.length - 1];
    const prevTrend = trends[trends.length - 1];
    
    if (basicUpperBand < prevFinalUpperBand || prevClose > prevFinalUpperBand) {
      finalUpperBand = basicUpperBand;
    } else {
      finalUpperBand = prevFinalUpperBand;
    }
    
    if (basicLowerBand > prevFinalLowerBand || prevClose < prevFinalLowerBand) {
      finalLowerBand = basicLowerBand;
    } else {
      finalLowerBand = prevFinalLowerBand;
    }
    
    let currentTrend = prevTrend;
    let currentSupertrend = 0;
    
    if (prevTrend === -1 && close > finalUpperBand) {
      currentTrend = 1;
    } else if (prevTrend === 1 && close < finalLowerBand) {
      currentTrend = -1;
    }
    
    if (currentTrend === 1) {
      currentSupertrend = finalLowerBand;
    } else {
      currentSupertrend = finalUpperBand;
    }
    
    finalUpperBands.push(finalUpperBand);
    finalLowerBands.push(finalLowerBand);
    supertrends.push(currentSupertrend);
    trends.push(currentTrend);
  }
  
  return trends[trends.length - 1] === 1;
}
