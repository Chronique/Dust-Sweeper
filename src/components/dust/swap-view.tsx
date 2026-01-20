"use client";

import { useEffect, useState } from "react";
import { useWalletClient, useAccount } from "wagmi";
import { getSmartAccountClient } from "~/lib/smart-account";
import { alchemy } from "~/lib/alchemy";
import { formatUnits, encodeFunctionData, erc20Abi, type Address } from "viem";
import { Refresh, ArrowRight, Wallet, Check, Coins } from "iconoir-react";

// Target Swap: USDC di Base Mainnet
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const SwapView = () => {
  const { data: walletClient } = useWalletClient();
  const { address: ownerAddress } = useAccount();

  const [tokens, setTokens] = useState<any[]>([]);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);

  // 1. Fetch Token List (Hanya yang ada isinya & BUKAN USDC)
  const fetchTokens = async () => {
    if (!ownerAddress || !walletClient) return;
    setLoading(true);
    try {
      const client = await getSmartAccountClient(walletClient);
      const address = client.account?.address;
      if (!address) return;

      const balances = await alchemy.core.getTokenBalances(address);
      
      // Filter: Balance > 0
      const nonZero = balances.tokenBalances.filter(t => 
        t.tokenBalance && BigInt(t.tokenBalance) > 0n
      );

      const metadata = await Promise.all(
        nonZero.map(t => alchemy.core.getTokenMetadata(t.contractAddress))
      );

      const formatted = nonZero.map((t, i) => {
        const meta = metadata[i];
        return {
          ...t,
          name: meta.name,
          symbol: meta.symbol,
          logo: meta.logo,
          decimals: meta.decimals || 18,
          rawBalance: t.tokenBalance,
          formattedBal: formatUnits(BigInt(t.tokenBalance || 0), meta.decimals || 18)
        };
      })
      // Sembunyikan USDC dari list "Source" (karena USDC adalah tujuan)
      .filter(t => t.contractAddress.toLowerCase() !== USDC_ADDRESS.toLowerCase());

      setTokens(formatted);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchTokens();
  }, [walletClient]);

  // 2. Get Quote to USDC
  const getKyberQuote = async (token: any) => {
    if (!token) return;
    setQuote(null);
    
    try {
      const baseUrl = "https://aggregator-api.kyberswap.com/base/api/v1/routes";
      const params = new URLSearchParams({
        tokenIn: token.contractAddress,
        tokenOut: USDC_ADDRESS, // 🔥 Target ke USDC
        amountIn: BigInt(token.rawBalance).toString()
      });

      const res = await fetch(`${baseUrl}?${params.toString()}`);
      const data = await res.json();

      if (data.message === "Successfully" && data.data.routeSummary) {
        setQuote(data.data);
      } else {
        setQuote(null);
      }
    } catch (e) {
      console.error("Kyber API Error:", e);
    }
  };

  useEffect(() => {
    if (selectedToken) {
      getKyberQuote(selectedToken);
    }
  }, [selectedToken]);

  // 3. Execute Swap (Gasless)
  const handleSwap = async () => {
    if (!selectedToken || !quote || !walletClient) return;
    
    try {
      setSwapping(true);
      const client = await getSmartAccountClient(walletClient);
      const vaultAddress = client.account?.address;
      if (!vaultAddress) return;

      // Build Transaction Route
      const buildRes = await fetch("https://aggregator-api.kyberswap.com/base/api/v1/route/build", {
        method: "POST",
        body: JSON.stringify({
          routeSummary: quote.routeSummary,
          sender: vaultAddress,
          recipient: vaultAddress,
          slippageTolerance: 100 // 1%
        })
      });
      
      const buildData = await buildRes.json();
      if (buildData.code !== 0) throw new Error("Gagal build route Kyber");

      const { data: swapCallData, routerAddress } = buildData.data;

      // Batch Calls: Approve + Swap
      const uoCalls = [
        {
          to: selectedToken.contractAddress as Address,
          value: 0n,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [routerAddress as Address, BigInt(selectedToken.rawBalance)]
          })
        },
        {
          to: routerAddress as Address,
          value: 0n,
          data: swapCallData as `0x${string}`
        }
      ];

      console.log("Sending Batch Swap USDC...", uoCalls);

      const hash = await client.sendUserOperation({
        account: client.account,
        calls: uoCalls
      });

      console.log("Swap Hash:", hash);
      await new Promise(r => setTimeout(r, 5000));
      
      alert("Berhasil Swap ke USDC! 💰");
      setSelectedToken(null);
      setQuote(null);
      fetchTokens();

    } catch (e: any) {
      console.error(e);
      alert(`Swap Gagal: ${e.message}`);
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="pb-20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Coins className="text-yellow-500" /> Dust to USDC
        </h2>
        <button onClick={fetchTokens} className="p-2 bg-zinc-100 rounded-full hover:bg-zinc-200">
          <Refresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="space-y-2">
        {tokens.length === 0 && !loading && (
          <div className="text-center py-10 border-2 border-dashed rounded-xl text-zinc-400">
            Tidak ada token debu untuk diswap.
          </div>
        )}

        {tokens.map((token, i) => (
          <div 
            key={i} 
            onClick={() => setSelectedToken(token)}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              selectedToken?.contractAddress === token.contractAddress 
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" 
              : "border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src={token.logo || `https://tokens.1inch.io/${token.contractAddress}.png`} 
                  onError={(e) => e.currentTarget.style.display = 'none'}
                  className="w-8 h-8 rounded-full bg-zinc-200"
                />
                <div>
                  <div className="font-semibold text-sm">{token.symbol}</div>
                  <div className="text-xs text-zinc-500">{token.formattedBal}</div>
                </div>
              </div>
              {selectedToken?.contractAddress === token.contractAddress && (
                <div className="text-blue-600"><Check className="w-5 h-5" /></div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedToken && (
        <div className="fixed bottom-24 left-4 right-4 p-4 bg-zinc-900 text-white rounded-2xl shadow-2xl border border-zinc-700 animate-in slide-in-from-bottom-5 z-50">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-zinc-400">Estimasi Dapat:</div>
            <div className="font-bold text-xl text-blue-400">
              {quote ? (+quote.routeSummary.amountOut / 1e6).toFixed(4) : "Loading..."} USDC
            </div>
          </div>
          <button
            disabled={!quote || swapping}
            onClick={handleSwap}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {swapping ? "Processing..." : "Swap to USDC"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};