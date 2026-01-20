"use client";

import { useEffect, useState } from "react";
import { useWalletClient, useAccount } from "wagmi";
import { getSmartAccountClient, publicClient } from "~/lib/smart-account";
import { alchemy } from "~/lib/alchemy";
import { formatUnits, encodeFunctionData, erc20Abi, type Address } from "viem";
import { Refresh, ArrowRight, Check, Coins, Dollar } from "iconoir-react";

// --- AERODROME V1 CONSTANTS (BASE) ---
const ROUTER_ADDRESS = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43"; 
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const routerAbi = [
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" }
    ],
    name: "getAmountsOut",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "swapExactTokensForETH",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "swapExactTokensForTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

export const SwapView = () => {
  const { data: walletClient } = useWalletClient();
  const { address: ownerAddress } = useAccount();

  const [tokens, setTokens] = useState<any[]>([]);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [target, setTarget] = useState<"ETH" | "USDC">("ETH");
  
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);

  const fetchTokens = async () => {
    if (!ownerAddress || !walletClient) return;
    setLoading(true);
    try {
      const client = await getSmartAccountClient(walletClient);
      const address = client.account?.address;
      if (!address) return;

      const balances = await alchemy.core.getTokenBalances(address);
      const nonZero = balances.tokenBalances.filter(t => t.tokenBalance && BigInt(t.tokenBalance) > 0n);

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
      }).filter(t => 
         t.contractAddress.toLowerCase() !== WETH_ADDRESS.toLowerCase() &&
         t.contractAddress.toLowerCase() !== USDC_ADDRESS.toLowerCase()
      );

      setTokens(formatted);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchTokens(); }, [walletClient]);

  useEffect(() => {
    const getQuote = async () => {
      if (!selectedToken) return;
      setQuoteLoading(true);
      setQuoteAmount(null);

      try {
        const targetAddress = target === "ETH" ? WETH_ADDRESS : USDC_ADDRESS;
        const path = [selectedToken.contractAddress as Address, targetAddress as Address];

        // Read from Aerodrome Contract
        const amounts = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getAmountsOut",
          args: [BigInt(selectedToken.rawBalance), path]
        }) as readonly bigint[];

        const decimals = target === "ETH" ? 18 : 6;
        setQuoteAmount(formatUnits(amounts[1], decimals));

      } catch (e) {
        console.warn("No liquidity path found on Aerodrome:", e);
        setQuoteAmount("0");
      } finally {
        setQuoteLoading(false);
      }
    };
    getQuote();
  }, [selectedToken, target]);

  const handleSwap = async () => {
    if (!selectedToken || !quoteAmount || !walletClient) return;
    
    try {
      setSwapping(true);
      const client = await getSmartAccountClient(walletClient);
      const vaultAddress = client.account?.address;
      if (!vaultAddress) return;

      const targetAddress = target === "ETH" ? WETH_ADDRESS : USDC_ADDRESS;
      const path = [selectedToken.contractAddress as Address, targetAddress as Address];
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

      let swapData: `0x${string}`;
      if (target === "ETH") {
        swapData = encodeFunctionData({
            abi: routerAbi,
            functionName: "swapExactTokensForETH",
            args: [BigInt(selectedToken.rawBalance), 0n, path, vaultAddress, deadline]
        });
      } else {
        swapData = encodeFunctionData({
            abi: routerAbi,
            functionName: "swapExactTokensForTokens",
            args: [BigInt(selectedToken.rawBalance), 0n, path, vaultAddress, deadline]
        });
      }

      // 🔥 FIX TYPE ERROR: Cast array to any to bypass strict checks
      const uoCalls = [
        {
          to: selectedToken.contractAddress as Address,
          value: 0n,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [ROUTER_ADDRESS, BigInt(selectedToken.rawBalance)]
          })
        },
        {
          to: ROUTER_ADDRESS,
          value: 0n,
          data: swapData
        }
      ] as any; // <--- INI SOLUSINYA!

      const hash = await client.sendUserOperation({
        account: client.account,
        calls: uoCalls
      });

      console.log("Tx Hash:", hash);
      await new Promise(r => setTimeout(r, 5000));
      
      alert(`Berhasil Swap ke ${target}! 🚀`);
      setSelectedToken(null);
      setQuoteAmount(null);
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
        <h2 className="text-lg font-bold">SWIPE VIA AERODOME</h2>
        <button onClick={fetchTokens} className="p-2 bg-zinc-100 rounded-full hover:bg-zinc-200">
          <Refresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
        <button 
            onClick={() => { setTarget("ETH"); setSelectedToken(null); }}
            className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${target === "ETH" ? "bg-white shadow-sm text-black" : "text-zinc-500"}`}
        >
            <Coins className="w-4 h-4 text-purple-500" /> to ETH
        </button>
        <button 
            onClick={() => { setTarget("USDC"); setSelectedToken(null); }}
            className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${target === "USDC" ? "bg-white shadow-sm text-black" : "text-zinc-500"}`}
        >
            <Dollar className="w-4 h-4 text-blue-500" /> to USDC
        </button>
      </div>

      <div className="space-y-2">
        {tokens.length === 0 && !loading && (
          <div className="text-center py-10 border-2 border-dashed rounded-xl text-zinc-400">
            There are no tokens to swap.
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
            <div className="text-sm text-zinc-400">Estimated Output:</div>
            <div className={`font-bold text-xl ${quoteAmount === "0" ? "text-red-400" : "text-green-400"}`}>
              {quoteLoading ? "Checking..." : 
               quoteAmount === "0" ? "No Liquidity" : 
               `${parseFloat(quoteAmount || "0").toFixed(6)} ${target}`
              }
            </div>
          </div>
          <button
            disabled={!quoteAmount || quoteAmount === "0" || swapping}
            onClick={handleSwap}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {swapping ? "Processing..." : `Swap to ${target}`} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};