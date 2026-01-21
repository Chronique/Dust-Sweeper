"use client";

import { useEffect, useState } from "react";
import { useWalletClient, useAccount } from "wagmi";
import { getSmartAccountClient, publicClient } from "~/lib/smart-account";
import { alchemy } from "~/lib/alchemy";
import { formatUnits, encodeFunctionData, erc20Abi, type Address } from "viem";
import { Refresh, ArrowRight, Check, Coins, Dollar, WarningCircle } from "iconoir-react";

// CONSTANTS
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
    name: "swapExactTokensForTokens",
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
    name: "swapExactTokensForETH", // Untuk swap ke ETH (WETH unwrapped)
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
  const [bestPath, setBestPath] = useState<Address[]>([]); // 🔥 Simpan jalur terbaik
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);

  // 1. Fetch Tokens (Sama)
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

  // 2. SMART ROUTING QUOTE (Direct vs Multi-Hop)
  useEffect(() => {
    const getQuote = async () => {
      if (!selectedToken) return;
      setQuoteLoading(true);
      setQuoteAmount(null);
      setBestPath([]);

      try {
        const targetAddress = target === "ETH" ? WETH_ADDRESS : USDC_ADDRESS;
        const tokenIn = selectedToken.contractAddress as Address;
        const amountIn = BigInt(selectedToken.rawBalance);

        // --- STRATEGI ROUTING ---
        // 1. Coba Direct: [Token, Target]
        const pathDirect = [tokenIn, targetAddress as Address];
        
        // 2. Coba Hop via WETH: [Token, WETH, Target]
        const pathHop = [tokenIn, WETH_ADDRESS as Address, targetAddress as Address];

        let bestOut = 0n;
        let finalPath: Address[] = [];

        // Cek Direct
        try {
          const res = await publicClient.readContract({
            address: ROUTER_ADDRESS, abi: routerAbi, functionName: "getAmountsOut",
            args: [amountIn, pathDirect]
          }) as readonly bigint[];
          bestOut = res[res.length - 1];
          finalPath = pathDirect;
        } catch (e) {}

        // Cek Hop (Jika target bukan ETH/WETH, karena kalau target ETH pathHop jadi [Token, WETH, WETH] aneh)
        if (target !== "ETH" && tokenIn.toLowerCase() !== WETH_ADDRESS.toLowerCase()) {
           try {
             const res = await publicClient.readContract({
               address: ROUTER_ADDRESS, abi: routerAbi, functionName: "getAmountsOut",
               args: [amountIn, pathHop]
             }) as readonly bigint[];
             
             // Kalau Hop lebih untung (atau satu-satunya jalan), pakai Hop
             if (res[res.length - 1] > bestOut) {
               bestOut = res[res.length - 1];
               finalPath = pathHop;
             }
           } catch (e) {}
        }

        if (bestOut > 0n) {
           const decimals = target === "ETH" ? 18 : 6;
           setQuoteAmount(formatUnits(bestOut, decimals));
           setBestPath(finalPath);
        } else {
           setQuoteAmount("0");
        }

      } catch (e) {
        console.warn("Routing error:", e);
        setQuoteAmount("0");
      } finally {
        setQuoteLoading(false);
      }
    };
    getQuote();
  }, [selectedToken, target]);

  // 3. EXECUTE SWAP
  const handleSwap = async () => {
    if (!selectedToken || !quoteAmount || bestPath.length === 0 || !walletClient) return;
    
    try {
      setSwapping(true);
      const client = await getSmartAccountClient(walletClient);
      const vaultAddress = client.account?.address;
      if (!vaultAddress) return;

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 min

      let swapData: `0x${string}`;
      
      // Pilih fungsi swap yang sesuai
      // Jika target ETH -> swapExactTokensForETH
      // Jika target USDC -> swapExactTokensForTokens
      if (target === "ETH") {
        swapData = encodeFunctionData({
            abi: routerAbi,
            functionName: "swapExactTokensForETH",
            args: [BigInt(selectedToken.rawBalance), 0n, bestPath, vaultAddress, deadline]
        });
      } else {
        swapData = encodeFunctionData({
            abi: routerAbi,
            functionName: "swapExactTokensForTokens",
            args: [BigInt(selectedToken.rawBalance), 0n, bestPath, vaultAddress, deadline]
        });
      }

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
      ] as any;

      const hash = await client.sendUserOperation({
        account: client.account,
        calls: uoCalls
      });

      console.log("Tx Hash:", hash);
      await new Promise(r => setTimeout(r, 5000));
      
      alert(`Sukses Swap via ${bestPath.length > 2 ? 'Multi-Hop' : 'Direct'}! 🚀`);
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
        <h2 className="text-lg font-bold">Smart Panen</h2>
        <button onClick={fetchTokens} className="p-2 bg-zinc-100 rounded-full hover:bg-zinc-200">
          <Refresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* TARGET SELECTOR */}
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
            There are no tokens to swap..
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
            <div className="text-sm text-zinc-400">Estimate Output:</div>
            <div className={`font-bold text-xl ${quoteAmount === "0" ? "text-red-400" : "text-green-400"}`}>
              {quoteLoading ? "Routing..." : 
               quoteAmount === "0" ? "No Liquidity" : 
               `${parseFloat(quoteAmount || "0").toFixed(6)} ${target}`
          }
            </div>
          </div>
          
          {/* INFO JALUR */}
          {bestPath.length > 2 && (
             <div className="text-xs text-blue-300 mb-4 flex items-center gap-1">
               <WarningCircle className="w-3 h-3" /> Multi-hop: {selectedToken.symbol} → WETH → {target}
             </div>
          )}

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