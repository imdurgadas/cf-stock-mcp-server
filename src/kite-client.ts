export async function callKiteTool(name: string, args: any): Promise<any> {
  const response = await fetch("https://mcp.kite.trade/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kite MCP server returned status ${response.status}: ${errorText}`);
  }

  const data = await response.json() as any;
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data.result;
}

const SYMBOL_MAPPING: Record<string, string> = {
  "INFRABEES.NS": "NSE:INFRABEES",
  "PSUBNKBEES.NS": "NSE:PSUBNKBEES",
  "NIFTYBEES.NS": "NSE:NIFTYBEES",
  "GOLDBEES.NS": "NSE:GOLDBEES",
  "SILVER1.NS": "NSE:SILVER1",
  "CPSEETF.NS": "NSE:CPSEETF",
  "ITBEES.NS": "NSE:ITBEES",
};

export function convertSymbolToKite(yahooSymbol: string): string {
  if (SYMBOL_MAPPING[yahooSymbol]) {
    return SYMBOL_MAPPING[yahooSymbol];
  }
  
  if (yahooSymbol.endsWith('.BO')) {
    return `BSE:${yahooSymbol.replace('.BO', '')}`;
  }
  
  return `NSE:${yahooSymbol.replace('.NS', '')}`;
}

export async function placeKiteOrder(
  symbol: string,
  quantity: number,
  orderType: string = "MARKET",
  product: string = "CNC"
): Promise<any> {
  try {
    const kiteSymbol = convertSymbolToKite(symbol);
    const parts = kiteSymbol.split(":");
    const exchange = parts.length > 1 ? parts[0] : "NSE";
    const tradingsymbol = parts.length > 1 ? parts[1] : kiteSymbol;

    const result = await callKiteTool("place_order", {
      variety: "regular",
      exchange,
      tradingsymbol,
      transaction_type: "BUY",
      quantity,
      product,
      order_type: orderType,
    });

    return {
      status: "success",
      symbol,
      kite_symbol: kiteSymbol,
      quantity,
      order_type: orderType,
      product,
      result,
    };
  } catch (error: any) {
    console.error(`Error placing order for ${symbol}:`, error);
    return { error: error.message || String(error), symbol };
  }
}

export async function getKiteHoldings(): Promise<any> {
  try {
    const result = await callKiteTool("get_holdings", {});

    return {
      status: "success",
      holdings: result,
    };
  } catch (error: any) {
    console.error("Error fetching holdings:", error);
    return { error: error.message || String(error) };
  }
}

export async function kiteLogin(): Promise<any> {
  try {
    const result = await callKiteTool("login", {});

    return {
      status: "success",
      login_info: result,
    };
  } catch (error: any) {
    console.error("Error logging in to Kite:", error);
    return { error: error.message || String(error) };
  }
}
