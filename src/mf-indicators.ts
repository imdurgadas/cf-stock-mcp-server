export interface MFDataResult {
  meta: {
    scheme_code: number;
    scheme_name: string;
    category: string;
    fund_house: string;
    latest_nav: number;
    latest_date: string;
  };
  returns: {
    trailing_1m_pct: number | null;
    trailing_3m_pct: number | null;
    trailing_6m_pct: number | null;
    trailing_1y_cagr: number | null;
    trailing_3y_cagr: number | null;
    trailing_5y_cagr: number | null;
  };
  risk_metrics: {
    annualized_volatility_pct: number | null;
    annualized_downside_volatility_pct: number | null;
    sharpe_ratio: number | null;
    sortino_ratio: number | null;
  };
  evaluation: {
    grade: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR';
    comment: string;
  };
  status: string;
  error?: string;
}

// Parse string "DD-MM-YYYY" into JS Date
function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Find NAV entry closest to the target Date
function findClosestNAV(navs: { date: Date; nav: number }[], targetDate: Date) {
  let closest = navs[0];
  let minDiff = Math.abs(navs[0].date.getTime() - targetDate.getTime());
  
  for (const entry of navs) {
    const diff = Math.abs(entry.date.getTime() - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closest = entry;
    }
  }
  return closest;
}

export async function fetchMutualFundData(schemeCode: number, riskFreeRate: number = 6.5): Promise<MFDataResult> {
  const url = `https://api.mfapi.in/mf/${schemeCode}`;
  
  try {
    console.log(`[MF Analysis] Fetching history from ${url}...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch from MF API (HTTP Status: ${response.status})`);
    }

    const json: any = await response.json();
    if (json.status !== 'SUCCESS' || !json.data || json.data.length === 0) {
      throw new Error(`No data returned for scheme code ${schemeCode}`);
    }

    const meta = json.meta;
    const history = json.data;

    // Convert and sort in chronological order (oldest first)
    const navs = history
      .map((item: any) => ({
        date: parseDate(item.date),
        nav: parseFloat(item.nav),
      }))
      .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

    const latest = navs[navs.length - 1];
    const latestNAV = latest.nav;
    const latestDate = latest.date;
    const latestDateStr = history[0].date; // dd-mm-yyyy

    // Helper function for trailing returns
    const getReturnsForDays = (days: number, isCagr: boolean = false): number | null => {
      const targetDate = new Date(latestDate);
      targetDate.setDate(latestDate.getDate() - days);

      // If the oldest NAV date in history is newer than our target date, we don't have enough history
      if (navs[0].date > targetDate) {
        return null;
      }

      const closestEntry = findClosestNAV(navs, targetDate);
      const pastNAV = closestEntry.nav;
      
      if (pastNAV <= 0) return null;

      if (!isCagr) {
        // Absolute return
        return ((latestNAV - pastNAV) / pastNAV) * 100;
      } else {
        // CAGR return
        const timeDiff = latestDate.getTime() - closestEntry.date.getTime();
        const years = timeDiff / (1000 * 60 * 60 * 24 * 365.25);
        if (years <= 0) return null;
        return (Math.pow(latestNAV / pastNAV, 1 / years) - 1) * 100;
      }
    };

    const trailing_1m = getReturnsForDays(30, false);
    const trailing_3m = getReturnsForDays(90, false);
    const trailing_6m = getReturnsForDays(180, false);
    const trailing_1y = getReturnsForDays(365, true);
    const trailing_3y = getReturnsForDays(1095, true);
    const trailing_5y = getReturnsForDays(1826, true);

    // Calculate Risk Metrics over the last 1 year (up to 250 daily returns)
    const dailyReturns: number[] = [];
    const oneYearAgo = new Date(latestDate);
    oneYearAgo.setDate(latestDate.getDate() - 365);

    // Filter NAVs in the last year
    const lastYearNavs = navs.filter((n: { date: Date; nav: number }) => n.date >= oneYearAgo);

    if (lastYearNavs.length > 2) {
      for (let i = 1; i < lastYearNavs.length; i++) {
        const prev = lastYearNavs[i - 1].nav;
        const curr = lastYearNavs[i].nav;
        if (prev > 0) {
          dailyReturns.push((curr - prev) / prev);
        }
      }
    }

    let annualizedVol: number | null = null;
    let annualizedDownsideVol: number | null = null;
    let sharpe: number | null = null;
    let sortino: number | null = null;

    if (dailyReturns.length > 5) {
      // Annualized Volatility (Standard Deviation)
      const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
      const dailyStdDev = Math.sqrt(variance);
      annualizedVol = dailyStdDev * Math.sqrt(250) * 100; // in %

      // Annualized Downside Volatility
      const downsideSumSq = dailyReturns.reduce((sum, r) => sum + Math.pow(Math.min(0, r), 2), 0);
      const dailyDownsideStdDev = Math.sqrt(downsideSumSq / (dailyReturns.length - 1));
      annualizedDownsideVol = dailyDownsideStdDev * Math.sqrt(250) * 100; // in %

      // Sharpe & Sortino (uses the 1-year return as base)
      const return1Y = trailing_1y ?? (trailing_6m ? trailing_6m * 2 : 0);
      
      if (annualizedVol > 0) {
        sharpe = (return1Y - riskFreeRate) / annualizedVol;
      }
      if (annualizedDownsideVol > 0) {
        sortino = (return1Y - riskFreeRate) / annualizedDownsideVol;
      }
    }

    // Evaluation Grading
    let grade: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR' = 'AVERAGE';
    let comment = '';

    const return1Y = trailing_1y ?? 0;
    const currentSharpe = sharpe ?? 0;

    if (currentSharpe > 1.5 && return1Y > 15) {
      grade = 'EXCELLENT';
      comment = `Outstanding risk-adjusted performance (Sharpe: ${currentSharpe.toFixed(2)}). Generates significant excess return relative to risk.`;
    } else if (currentSharpe > 0.8 || return1Y > 12) {
      grade = 'GOOD';
      comment = `Solid consistent performance (Sharpe: ${currentSharpe.toFixed(2)}). Good wealth creation with manageable volatility.`;
    } else if (currentSharpe >= 0.2 || return1Y > 6) {
      grade = 'AVERAGE';
      comment = `Moderate returns (Sharpe: ${currentSharpe.toFixed(2)}). Performance is inline with standard debt or conservative indices.`;
    } else {
      grade = 'POOR';
      comment = `Underperforming risk-adjusted metrics (Sharpe: ${currentSharpe.toFixed(2)}). Return profile does not justify the fund's volatility risk.`;
    }

    const formatNum = (val: number | null, dec = 2): number | null => {
      if (val === null || isNaN(val)) return null;
      return parseFloat(val.toFixed(dec));
    };

    return {
      meta: {
        scheme_code: Number(meta.scheme_code),
        scheme_name: meta.scheme_name,
        category: meta.scheme_category,
        fund_house: meta.fund_house,
        latest_nav: latestNAV,
        latest_date: latestDateStr,
      },
      returns: {
        trailing_1m_pct: formatNum(trailing_1m),
        trailing_3m_pct: formatNum(trailing_3m),
        trailing_6m_pct: formatNum(trailing_6m),
        trailing_1y_cagr: formatNum(trailing_1y),
        trailing_3y_cagr: formatNum(trailing_3y),
        trailing_5y_cagr: formatNum(trailing_5y),
      },
      risk_metrics: {
        annualized_volatility_pct: formatNum(annualizedVol),
        annualized_downside_volatility_pct: formatNum(annualizedDownsideVol),
        sharpe_ratio: formatNum(sharpe),
        sortino_ratio: formatNum(sortino),
      },
      evaluation: {
        grade,
        comment,
      },
      status: 'success',
    };
  } catch (error: any) {
    console.error(`[MF Analysis] Error analyzing scheme ${schemeCode}:`, error.message);
    return {
      meta: {
        scheme_code: schemeCode,
        scheme_name: 'Unknown Scheme',
        category: 'N/A',
        fund_house: 'N/A',
        latest_nav: 0,
        latest_date: 'N/A',
      },
      returns: {
        trailing_1m_pct: null,
        trailing_3m_pct: null,
        trailing_6m_pct: null,
        trailing_1y_cagr: null,
        trailing_3y_cagr: null,
        trailing_5y_cagr: null,
      },
      risk_metrics: {
        annualized_volatility_pct: null,
        annualized_downside_volatility_pct: null,
        sharpe_ratio: null,
        sortino_ratio: null,
      },
      evaluation: {
        grade: 'POOR',
        comment: `Analysis failed: ${error.message || String(error)}`,
      },
      status: 'error',
      error: error.message || String(error),
    };
  }
}

export interface AMFISearchResult {
  scheme_code: number;
  scheme_name: string;
  isin_growth: string;
  isin_reinvestment: string;
  latest_nav: number | null;
  date: string;
}

export async function searchMutualFundsAMFI(query: string): Promise<AMFISearchResult[]> {
  try {
    console.log(`[AMFI Search] Fetching master list from https://www.amfiindia.com/spages/NAVAll.txt...`);
    const res = await fetch("https://www.amfiindia.com/spages/NAVAll.txt");
    if (!res.ok) throw new Error("Failed to fetch AMFI NAV list from amfiindia.com");

    const text = await res.text();
    const lines = text.split("\n");
    const results: AMFISearchResult[] = [];
    const lowerQuery = query.toLowerCase().trim();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("Scheme Code")) continue;

      const parts = trimmed.split(";");
      if (parts.length >= 4) {
        const schemeCodeStr = parts[0].trim();
        const isinGrowth = parts[1].trim();
        const isinReinvest = parts[2].trim();
        const schemeName = parts[3].trim();

        if (!schemeCodeStr || !schemeName) continue;

        const matchCode = schemeCodeStr.toLowerCase().includes(lowerQuery);
        const matchName = schemeName.toLowerCase().includes(lowerQuery);
        const matchIsin = isinGrowth.toLowerCase().includes(lowerQuery) || isinReinvest.toLowerCase().includes(lowerQuery);

        if (matchCode || matchName || matchIsin) {
          const schemeCode = parseInt(schemeCodeStr, 10);
          if (!isNaN(schemeCode)) {
            const navVal = parts[4] ? parseFloat(parts[4].trim()) : null;
            results.push({
              scheme_code: schemeCode,
              scheme_name: schemeName,
              isin_growth: isinGrowth || "N/A",
              isin_reinvestment: isinReinvest || "N/A",
              latest_nav: isNaN(navVal as number) ? null : navVal,
              date: parts[5] ? parts[5].trim() : "N/A"
            });
          }
        }
      }
    }

    results.sort((a, b) => a.scheme_name.localeCompare(b.scheme_name));
    return results.slice(0, 50);
  } catch (err: any) {
    console.error("Error in searchMutualFundsAMFI:", err.message);
    throw err;
  }
}
