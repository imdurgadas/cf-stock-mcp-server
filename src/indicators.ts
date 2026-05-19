import { RSI, EMA, ATR, ADX, MACD, BollingerBands, SMA } from 'technicalindicators';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

export interface StockDataResult {
  symbol: string;
  ltp: number;
  prev_close: number;
  fall_pct: number;
  rsi: number | null;
  ema_20: number | null;
  ema_50: number | null;
  price_above_ema20: boolean;
  price_above_ema50: boolean;
  is_st_green: boolean;
  is_ema_bullish_crossover: boolean;
  // New Indicators
  adx: number | null;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  } | null;
  is_macd_bullish: boolean;
  bb: {
    upper: number;
    middle: number;
    lower: number;
  } | null;
  is_near_bb_lower: boolean;
  volume: number;
  volume_sma20: number | null;
  is_volume_surge: boolean;
  comment: string;
  status: string;
  error?: string;
}



export async function fetchStockData(rawSymbol: string): Promise<StockDataResult> {
  // Ensure we query Indian stocks by default if no exchange suffix is provided
  const symbol = rawSymbol.includes('.') ? rawSymbol : `${rawSymbol}.NS`;

  try {
    const end = new Date();
    const start = new Date();
    // 250 days of data to ensure indicators like ADX and MACD have stabilized
    start.setDate(end.getDate() - 250); 

    const queryOptions = {
      period1: start,
      period2: end,
      interval: '1d' as const,
    };

    // Use chart() instead of historical() as historical() is deprecated
    const chartResult = await yahooFinance.chart(symbol, queryOptions);
    const result = chartResult.quotes.filter((q: any) => 
      q.close !== null && q.close !== undefined &&
      q.high !== null && q.high !== undefined &&
      q.low !== null && q.low !== undefined
    );

    if (!result || result.length === 0) {
      throw new Error(`No data available for ${symbol}`);
    }

    const closes = result.map((r: any) => r.close);
    const highs = result.map((r: any) => r.high);
    const lows = result.map((r: any) => r.low);
    const volumes = result.map((r: any) => r.volume || 0);

    if (closes.length < 50) {
      throw new Error(`Not enough data for ${symbol} to calculate indicators`);
    }

    const ltp = closes[closes.length - 1] ?? 0;
    const prev_close = closes[closes.length - 2] ?? 0;
    const fall_pct = prev_close !== 0 ? ((ltp - prev_close) / prev_close) * 100 : 0;
    const currentVolume = volumes[volumes.length - 1] ?? 0;

    // Calculate RSI (14)
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const currentRsi = rsiValues[rsiValues.length - 1] ?? null;

    // Calculate EMAs
    const ema20Values = EMA.calculate({ values: closes, period: 20 });
    const ema50Values = EMA.calculate({ values: closes, period: 50 });
    const currentEma20 = ema20Values[ema20Values.length - 1] ?? null;
    const currentEma50 = ema50Values[ema50Values.length - 1] ?? null;
    const prevEma20 = ema20Values[ema20Values.length - 2] ?? null;
    const prevEma50 = ema50Values[ema50Values.length - 2] ?? null;

    const isEmaBullishCrossover = (currentEma20 !== null && currentEma50 !== null && prevEma20 !== null && prevEma50 !== null) 
      ? (prevEma20 <= prevEma50 && currentEma20 > currentEma50) 
      : false;

    // Calculate Supertrend (10, 3)
    const isStGreen = calculateSupertrend(highs, lows, closes, 10, 3);

    // Calculate ADX (14)
    const adxValues = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
    const currentAdx = adxValues[adxValues.length - 1]?.adx ?? null;

    // Calculate MACD (12, 26, 9)
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const currentMacd = (macdValues[macdValues.length - 1] || null) as any;
    const prevMacd = macdValues[macdValues.length - 2] as any;
    const isMacdBullish = (currentMacd && prevMacd) 
      ? ((currentMacd.macd || currentMacd.MACD) > currentMacd.signal && (prevMacd.macd || prevMacd.MACD) <= prevMacd.signal) 
      : false;

    // Calculate Bollinger Bands (20, 2)
    const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
    const currentBb = bbValues[bbValues.length - 1] || null;
    const isNearBbLower = (currentBb && currentBb.lower > 0) ? ltp <= currentBb.lower * 1.01 : false;

    // Calculate Volume SMA (20)
    const volumeSmaValues = SMA.calculate({ values: volumes, period: 20 });
    const currentVolumeSma = volumeSmaValues[volumeSmaValues.length - 1] ?? null;
    const isVolumeSurge = (currentVolumeSma && currentVolumeSma > 0) ? currentVolume > currentVolumeSma * 1.5 : false;

    const safeFormat = (val: any, decimals: number = 2): number | null => {
      if (val === null || val === undefined || isNaN(val)) return null;
      if (typeof val !== 'number') return null;
      return Number(val.toFixed(decimals));
    };

    const safeNum = (val: any, decimals: number = 2): number => {
      const formatted = safeFormat(val, decimals);
      return formatted === null ? 0 : formatted;
    };

    const generateAnalysis = () => {
      let trend = "Neutral";
      if (ltp > (currentEma20 ?? 0) && ltp > (currentEma50 ?? 0) && isStGreen) trend = "Strong Bullish";
      else if (ltp > (currentEma20 ?? 0) && ltp > (currentEma50 ?? 0)) trend = "Bullish";
      else if (ltp < (currentEma20 ?? 0) && ltp < (currentEma50 ?? 0)) trend = "Bearish";
      
      let momentum = "Neutral";
      if ((currentRsi ?? 50) < 30) momentum = "Oversold";
      else if ((currentRsi ?? 50) > 70) momentum = "Overbought";
      
      let qualified = [];
      let totalParams = 0;
      
      // Parameter 1: Bullish Trend (EMA20/50 + ST Green)
      totalParams++;
      const trendBullish = ltp > (currentEma20 ?? 0) && ltp > (currentEma50 ?? 0) && isStGreen;
      if (trendBullish) {
        qualified.push("Bullish Trend Confirmation");
      }
      
      // Parameter 2: Trend Strength (ADX >= 25)
      totalParams++;
      if ((currentAdx ?? 0) >= 25) {
        qualified.push("ADX Trend Strength (>= 25)");
      }
      
      // Parameter 3: Deep Value (RSI < 30)
      totalParams++;
      if ((currentRsi ?? 50) < 30) {
        qualified.push("RSI Deep Value (< 30)");
      } else if ((currentRsi ?? 50) >= 50 && (currentRsi ?? 50) <= 65) {
        qualified.push("RSI Pullback Range (50-65)");
      }
      
      // Parameter 4: Volume Surge (> 1.5x)
      totalParams++;
      if (isVolumeSurge) {
        qualified.push("Volume Surge (> 1.5x 20-day SMA)");
      }
      
      // Parameter 5: Bollinger Band Mean Reversion
      totalParams++;
      if (isNearBbLower) {
        qualified.push("Bollinger Lower Band Reversion");
      }
      
      // Parameter 6: MACD Bullish Crossover
      totalParams++;
      if (isMacdBullish) {
        qualified.push("MACD Bullish Crossover");
      }
      
      // Parameter 7: EMA Bullish Crossover
      totalParams++;
      if (isEmaBullishCrossover) {
        qualified.push("EMA 20/50 Bullish Crossover");
      }

      // Parameter 8: Dip Size (<= -2%)
      totalParams++;
      if (fall_pct <= -2) {
        qualified.push(`Price Dip (<= -2%, actual: ${fall_pct.toFixed(2)}%)`);
      }

      let summary = `Trend: ${trend} | Momentum: ${momentum} | Qualified parameters: ${qualified.length}/${totalParams}`;
      if (qualified.length > 0) {
        summary += ` [${qualified.join(", ")}]`;
      } else {
        summary += ` [None]`;
      }
      
      return {
        comment: summary
      };
    };

    const analysis = generateAnalysis();

    return {
      symbol,
      ltp: safeNum(ltp),
      prev_close: safeNum(prev_close),
      fall_pct: safeNum(fall_pct),
      rsi: safeFormat(currentRsi),
      ema_20: safeFormat(currentEma20),
      ema_50: safeFormat(currentEma50),
      price_above_ema20: currentEma20 !== null ? ltp > currentEma20 : false,
      price_above_ema50: currentEma50 !== null ? ltp > currentEma50 : false,
      is_st_green: isStGreen,
      is_ema_bullish_crossover: isEmaBullishCrossover,
      adx: safeFormat(currentAdx),
      macd: currentMacd ? {
        macd: safeNum(currentMacd.macd || currentMacd.MACD),
        signal: safeNum(currentMacd.signal),
        histogram: safeNum(currentMacd.histogram),
      } : null,
      is_macd_bullish: isMacdBullish,
      bb: currentBb ? {
        upper: safeNum(currentBb.upper),
        middle: safeNum(currentBb.middle),
        lower: safeNum(currentBb.lower),
      } : null,
      is_near_bb_lower: isNearBbLower,
      volume: currentVolume,
      volume_sma20: safeFormat(currentVolumeSma, 0),
      is_volume_surge: isVolumeSurge,
      comment: analysis.comment,
      status: 'success',
    };
  } catch (error: any) {
    return {
      symbol,
      ltp: 0,
      prev_close: 0,
      fall_pct: 0,
      rsi: null,
      ema_20: null,
      ema_50: null,
      price_above_ema20: false,
      price_above_ema50: false,
      is_st_green: false,
      is_ema_bullish_crossover: false,
      adx: null,
      macd: null,
      is_macd_bullish: false,
      bb: null,
      is_near_bb_lower: false,
      volume: 0,
      volume_sma20: null,
      is_volume_surge: false,
      comment: "Analysis failed",
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
    
    if (prevTrend === -1 && close > finalUpperBand) {
      currentTrend = 1;
    } else if (prevTrend === 1 && close < finalLowerBand) {
      currentTrend = -1;
    }
    
    finalUpperBands.push(finalUpperBand);
    finalLowerBands.push(finalLowerBand);
    trends.push(currentTrend);
  }
  
  return trends[trends.length - 1] === 1;
}

