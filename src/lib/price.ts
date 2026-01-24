// src/lib/price.ts

// Kita pakai GeckoTerminal karena dia support Contract Address (gratis & tanpa API Key)
const BASE_API_URL = "https://api.geckoterminal.com/api/v2/networks/base/tokens_multi";

export const fetchTokenPrices = async (contractAddresses: string[]) => {
  if (contractAddresses.length === 0) return {};

  try {
    // GeckoTerminal limit 30 address per request
    // Kita ambil 30 pertama saja untuk demo, atau kamu bisa buat logic chunking
    const addresses = contractAddresses.slice(0, 30).join(",");
    
    const res = await fetch(`${BASE_API_URL}/${addresses}`);
    const data = await res.json();

    // Format return: { "0x123...": 1.5, "0xabc...": 0.002 }
    const prices: Record<string, number> = {};
    
    if (data.data) {
      data.data.forEach((token: any) => {
        prices[token.attributes.address] = parseFloat(token.attributes.price_usd);
      });
    }

    return prices;
  } catch (error) {
    console.error("Failed to get price from GeckoTerminal:", error);
    return {};
  }
};