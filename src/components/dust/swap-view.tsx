"use client";

import { useEffect, useState } from "react";
import { useWalletClient, useAccount } from "wagmi";
// 👇 GANTI IMPORT KE SWITCHER
import { getUnifiedSmartAccountClient } from "~/lib/smart-account-switcher"; 
import { alchemy } from "~/lib/alchemy";
import { formatUnits, parseUnits, erc20Abi, type Address, encodeFunctionData } from "viem";
import { Refresh, ArrowRight, Check, Coins, Dollar, WarningCircle } from "iconoir-react";
import { SimpleToast } from "~/components/ui/simple-toast";

const ZEROEX_ROUTER = "0xdef1c0ded9bec7f1a1670819833240f027b25eff";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; 

export const SwapView = () => {
  const { data: walletClient } = useWalletClient();
  // 👇 AMBIL CONNECTOR
  const { address: ownerAddress, connector } = useAccount();

  const [tokens, setTokens] = useState<any[]>([]);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [target, setTarget] = useState<"ETH" | "USDC">("ETH");
  
  const [quoteData, setQuoteData] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [toast, setToast] = useState<{ msg: string, type: "success" | "error" } | null>(null);

  // 1. FETCH TOKENS
  const fetchVaultTokens = async () => {
    if (!walletClient) return;
    setLoading(true);
    try {
      // 👇 UNIFIED CLIENT
      const client = await getUnifiedSmartAccountClient(walletClient, connector?.id);
      const vaultAddress = client.account.address;
      
      const balances = await alchemy.core.getTokenBalances(vaultAddress);
      const nonZero = balances.tokenBalances.filter(t => 
        t.tokenBalance && BigInt(t.tokenBalance) > 0n &&
        t.contractAddress.toLowerCase() !== WETH_ADDRESS.toLowerCase()
      );

      const metadata = await Promise.all(
        nonZero.map(t => alchemy.core.getTokenMetadata(t.contractAddress))
      );

      const formatted = nonZero.map((t, i) => {
        const meta = metadata[i];
        return {
          ...t,
          name: meta.name || "Unknown",
          symbol: meta.symbol || "UNK",
          logo: meta.logo,
          decimals: meta.decimals || 18,
          rawBalance: t.tokenBalance,
          formattedBal: formatUnits(BigInt(t.tokenBalance || 0), meta.decimals || 18)
        };
      });

      setTokens(formatted);
    } catch (e) { 
      console.error(e); 
      setToast({ msg: "Failed scan vault.", type: "error" });
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { fetchVaultTokens(); }, [walletClient, connector?.id]);

  // 2. FETCH QUOTE (SAMA)
  useEffect(() => {
    const getQuote = async () => {
      if (!selectedToken) {
         setQuoteData(null);
         return;
      }
      
      setQuoteLoading(true);
      setQuoteData(null);

      try {
        const sellToken = selectedToken.contractAddress;
        const buyToken = target === "ETH" ? ETH_ADDRESS : USDC_ADDRESS;
        const sellAmount = selectedToken.rawBalance;

        const res = await fetch(`/api/0x/quote?sellToken=${sellToken}&buyToken=${buyToken}&sellAmount=${sellAmount}`);
        const data = await res.json();

        if (data.code) {
           console.warn("0x Error:", data);
           setQuoteData(null);
        } else {
           setQuoteData(data);
        }

      } catch (e) {
        console.warn("Quote error:", e);
        setQuoteData(null);
      } finally {
        setQuoteLoading(false);
      }
    };
    
    const timer = setTimeout(() => getQuote(), 500);
    return () => clearTimeout(timer);

  }, [selectedToken, target]);

  // 3. EXECUTE SWAP
  const handleSwap = async () => {
    if (!selectedToken || !quoteData || !walletClient) return;
    
    try {
      setSwapping(true);
      // 👇 UNIFIED CLIENT
      const client = await getUnifiedSmartAccountClient(walletClient, connector?.id);
      
      const txData = quoteData.data; 
      const toAddress = quoteData.to; 
      const value = quoteData.value; 

      const hash = await client.sendUserOperation({
        account: client.account,
        calls: [
          // 1. Approve Token
          {
            to: selectedToken.contractAddress as Address,
            value: 0n,
            data: encodeFunctionData({
               abi: erc20Abi,
               functionName: "approve",
               args: [toAddress as Address, BigInt(selectedToken.rawBalance)]
            })
          },
          // 2. Eksekusi Swap
          {
            to: toAddress as Address,
            value: BigInt(value || 0),
            data: txData as `0x${string}`
          }
        ]
      });

      console.log("Swap Hash:", hash);
      setToast({ msg: "Swap Berhasil via 0x! 🚀", type: "success" });
      
      setSelectedToken(null);
      setQuoteData(null);
      setTimeout(fetchVaultTokens, 4000);

    } catch (e: any) {
      console.error(e);
      setToast({ msg: "Swap Failed: " + (e.shortMessage || "Error"), type: "error" });
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="pb-20 p-4 space-y-4">
      {/* UI SAMA PERSIS */}
      <SimpleToast message={toast?.msg || null} type={toast?.type} onClose={() => setToast(null)} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-800 dark:text-white">Smart Panen (0x API)</h2>
        <button onClick={fetchVaultTokens} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200">
          <Refresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* TARGET SELECTOR */}
      <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
        <button 
            onClick={() => { setTarget("ETH"); setSelectedToken(null); }}
            className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${target === "ETH" ? "bg-white dark:bg-zinc-700 shadow-sm text-black dark:text-white" : "text-zinc-500"}`}
        >
            <Coins className="w-4 h-4 text-purple-500" /> to ETH
        </button>
        <button 
            onClick={() => { setTarget("USDC"); setSelectedToken(null); }}
            className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${target === "USDC" ? "bg-white dark:bg-zinc-700 shadow-sm text-black dark:text-white" : "text-zinc-500"}`}
        >
            <Dollar className="w-4 h-4 text-blue-500" /> to USDC
        </button>
      </div>

      {/* TOKEN LIST */}
      <div className="space-y-2">
        {tokens.length === 0 && !loading && (
          <div className="text-center py-10 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400">
              Vault is empty.
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
                 <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                    {token.logo ? <img src={token.logo} className="w-full h-full object-cover"/> : <span className="text-xs">{token.symbol[0]}</span>}
                 </div>
                 <div>
                   <div className="font-semibold text-sm">{token.symbol}</div>
                   <div className="text-xs text-zinc-500">{token.formattedBal}</div>
                 </div>
              </div>
              {selectedToken?.contractAddress === token.contractAddress && <div className="text-blue-600"><Check className="w-5 h-5" /></div>}
            </div>
          </div>
        ))}
      </div>

      {/* QUOTE PANEL */}
      {selectedToken && (
        <div className="fixed bottom-24 left-4 right-4 p-4 bg-zinc-900 text-white rounded-2xl shadow-2xl border border-zinc-700 animate-in slide-in-from-bottom-5 z-50">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-zinc-400">Best Price (0x):</div>
            <div className={`font-bold text-xl ${!quoteData ? "text-zinc-500" : "text-green-400"}`}>
              {quoteLoading ? "Finding best route..." : 
               !quoteData ? "No Route Found" : 
               `${parseFloat(quoteData.buyAmount ? formatUnits(quoteData.buyAmount, target === "ETH" ? 18 : 6) : "0").toFixed(6)} ${target}`
              }
            </div>
          </div>
          
          {quoteData?.sources && (
             <div className="text-[10px] text-zinc-400 mb-4 flex flex-wrap gap-1">
               via: {quoteData.sources.filter((s: any) => parseFloat(s.proportion) > 0).map((s:any) => s.name).join(", ")}
             </div>
          )}

          <button
            disabled={!quoteData || swapping}
            onClick={handleSwap}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {swapping ? "Swapping (Sponsored)..." : `Swap to ${target}`} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};