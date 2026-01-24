"use client";

import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWalletClient, useSwitchChain } from "wagmi";

// Libs
import { getUnifiedSmartAccountClient } from "~/lib/smart-account-switcher"; 
import { alchemy } from "~/lib/alchemy";
import { formatUnits, encodeFunctionData, erc20Abi, type Address, parseEther, formatEther, toHex } from "viem";
import { baseSepolia } from "viem/chains"; 

// Icons & UI
import { Copy, Refresh, Flash, ArrowRight, Check, Plus, Wallet, WarningTriangle } from "iconoir-react";
import { SimpleToast } from "~/components/ui/simple-toast";

// ✅ CONFIG ADDRESS
const SWAPPER_ADDRESS = "0xdBe1e97FB92E6511351FB8d01B0521ea9135Af12"; 
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; 

const TokenLogo = ({ token }: { token: any }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { setSrc(token.logo || null); }, [token]);
  
  const sources = [
    token.logo,
    `https://tokens.1inch.io/${token.contractAddress}.png`,
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/${token.contractAddress}/logo.png`
  ].filter(Boolean);

  if (!src && sources.length === 0) return <div className="text-[10px] font-bold">?</div>;
  
  return (
    <img 
      src={src || sources[1] || sources[2]} 
      className="w-full h-full object-cover" 
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
      alt={token.symbol}
    />
  );
};

export const SwapView = () => {
  const { address: ownerAddress, connector, chainId } = useAccount(); 
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  
  // ✅ PAKE WAGMI BIASA (STABIL) UNTUK EOA
  const { writeContractAsync } = useWriteContract();

  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<string>("Detecting...");
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false); 
  const [depositStatus, setDepositStatus] = useState<string | null>(null); 
  const [toast, setToast] = useState<{ msg: string, type: "success" | "error" } | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());

  // 1. FETCH DATA & DETECT TYPE
  const fetchVaultData = async () => {
    if (!walletClient) return;
    setLoading(true);

    try {
      // Index 0n = Permanent Wallet
      const client = await getUnifiedSmartAccountClient(walletClient, connector?.id, 0n);
      
      if (!client.account) return;
      const vAddr = client.account.address;
      setVaultAddress(vAddr);

      // Deteksi Tipe Akun untuk Label UI
      // @ts-ignore
      const isCSW = client.account.source === "coinbaseSmartAccount" || client.account.type === "coinbaseSmartAccount";
      setAccountType(isCSW ? "Coinbase Smart Wallet" : "Simple Account (EOA)");

      // Fetch Token Balance via Alchemy
      const balances = await alchemy.core.getTokenBalances(vAddr);
      const nonZeroTokens = balances.tokenBalances.filter(t => t.tokenBalance && BigInt(t.tokenBalance) > 0n);
      
      const metadata = await Promise.all(
        nonZeroTokens.map(t => alchemy.core.getTokenMetadata(t.contractAddress))
      );

      const formatted = nonZeroTokens.map((t, i) => {
          const meta = metadata[i];
          return {
              ...t,
              name: meta.name,
              symbol: meta.symbol,
              logo: meta.logo,
              contractAddress: t.contractAddress,
              decimals: meta.decimals || 18,
              rawBalance: t.tokenBalance,
              formattedBal: formatUnits(BigInt(t.tokenBalance || 0), meta.decimals || 18)
          };
      });
      
      const dustTokens = formatted.filter(t => t.contractAddress.toLowerCase() !== USDC_ADDRESS.toLowerCase());
      setTokens(dustTokens);

    } catch (e) { 
        console.error("Fetch Error:", e); 
    } finally { 
        setLoading(false); 
    }
  };

  useEffect(() => { 
      if(walletClient) fetchVaultData(); 
  }, [walletClient, connector?.id]); 

  // --- SELECTION LOGIC ---
  const toggleSelect = (address: string) => {
      const newSet = new Set(selectedTokens);
      if (newSet.has(address)) newSet.delete(address);
      else newSet.add(address);
      setSelectedTokens(newSet);
  };

  const toggleSelectAll = () => {
      if (selectedTokens.size === tokens.length) setSelectedTokens(new Set()); 
      else setSelectedTokens(new Set(tokens.map(t => t.contractAddress))); 
  };

  const handleTopUpSwapper = async () => {
      if(!ownerAddress) return;
      const amount = prompt("Isi saldo Swapper (ETH):", "0.01");
      if(!amount) return;
      try {
        await walletClient?.sendTransaction({ 
            to: SWAPPER_ADDRESS as Address, 
            value: parseEther(amount), 
            chain: baseSepolia 
        });
        setToast({msg: "Topup Sent!", type: "success"});
      } catch(e) { console.error(e); }
  };

  // 🔥🔥🔥 HANDLE BATCH SWAP (HYBRID & TYPE-SAFE) 🔥🔥🔥
  const handleBatchSwap = async () => {
    if (!vaultAddress || selectedTokens.size === 0) return;
    
    // Auto Switch Chain
    if (chainId !== baseSepolia.id) {
        try { await switchChainAsync({ chainId: baseSepolia.id }); } 
        catch { return; }
    }

    if (!window.confirm(`Swap ${selectedTokens.size} assets?\nType: ${accountType}`)) return;
    setDepositStatus("Preparing Batch...");

    try {
        const isCoinbase = connector?.id === 'coinbaseWalletSDK';
        
        // ============================================
        // 🚀 JALUR 1: COINBASE SMART WALLET (Manual RPC)
        // ============================================
        if (isCoinbase) {
            setDepositStatus("Sending to Coinbase...");
            
            const calls = [];
            
            for (const addr of selectedTokens) {
                const token = tokens.find(t => t.contractAddress === addr);
                if (!token) continue;

                // 1. Approve
                calls.push({
                    to: token.contractAddress as Address,
                    data: encodeFunctionData({ 
                        abi: erc20Abi, 
                        functionName: "approve", 
                        args: [SWAPPER_ADDRESS as Address, BigInt(token.rawBalance)] 
                    }),
                    value: toHex(0n) // Wajib Hex string buat RPC call
                });

                // 2. Swap
                const swapperAbi = [{ name: "swapTokenForETH", type: "function", stateMutability: "nonpayable", inputs: [{type: "address", name: "token"}, {type: "uint256", name: "amount"}], outputs: [] }] as const;
                calls.push({
                    to: SWAPPER_ADDRESS as Address,
                    data: encodeFunctionData({ 
                        abi: swapperAbi, 
                        functionName: "swapTokenForETH", 
                        args: [token.contractAddress as Address, BigInt(token.rawBalance)] 
                    }),
                    value: toHex(0n)
                });
            }

            // 🔥 FIX UTAMA: GUNAKAN 'as any' AGAR TYPESCRIPT TIDAK REWEL
            // wallet_sendCalls adalah standar baru (EIP-5792) yang mungkin belum ada di type definition Viem lama.
            // Secara runtime ini PASTI jalan di Coinbase Wallet.
            const id = await walletClient?.request({
                method: 'wallet_sendCalls' as any,
                params: [{
                    version: '1.0',
                    chainId: toHex(baseSepolia.id),
                    from: ownerAddress as Address,
                    calls: calls
                }] as any
            });
            
            console.log("Coinbase Batch ID:", id);
        } 
        
        // ============================================
        // 🐢 JALUR 2: METAMASK / EOA (Contract Call)
        // ============================================
        else {
            setDepositStatus("Signing via Wallet...");
            
            const dests: Address[] = [];
            const values: bigint[] = [];
            const datas: `0x${string}`[] = [];

            for (const addr of selectedTokens) {
                const token = tokens.find(t => t.contractAddress === addr);
                if (!token) continue;
                
                // 1. Approve
                dests.push(token.contractAddress as Address); 
                values.push(0n);
                datas.push(encodeFunctionData({ 
                    abi: erc20Abi, 
                    functionName: "approve", 
                    args: [SWAPPER_ADDRESS as Address, BigInt(token.rawBalance)] 
                }));

                // 2. Swap
                const swapperAbi = [{ name: "swapTokenForETH", type: "function", stateMutability: "nonpayable", inputs: [{type: "address", name: "token"}, {type: "uint256", name: "amount"}], outputs: [] }] as const;
                dests.push(SWAPPER_ADDRESS as Address); 
                values.push(0n);
                datas.push(encodeFunctionData({ 
                    abi: swapperAbi, 
                    functionName: "swapTokenForETH", 
                    args: [token.contractAddress as Address, BigInt(token.rawBalance)] 
                }));
            }

            const batchAbi = [{ type: 'function', name: 'executeBatch', inputs: [{ name: 'dest', type: 'address[]' }, { name: 'value', type: 'uint256[]' }, { name: 'func', type: 'bytes[]' }], outputs: [], stateMutability: 'payable' }] as const;

            const hash = await writeContractAsync({
                address: vaultAddress as Address,
                abi: batchAbi,
                functionName: 'executeBatch',
                args: [dests, values, datas],
                chainId: baseSepolia.id
            });
            console.log("Tx Hash:", hash);
        }

        setDepositStatus("Submitted! 🚀");
        await new Promise(r => setTimeout(r, 5000));
        
        // UI Cleanup
        setTokens(prev => prev.filter(t => !selectedTokens.has(t.contractAddress)));
        setSelectedTokens(new Set()); 
        setToast({ msg: "Swap Processed!", type: "success" });

    } catch (e: any) {
        console.error("SWAP ERROR:", e);
        setToast({ msg: "Failed: " + (e.shortMessage || e.message), type: "error" });
    } finally { 
        setDepositStatus(null); 
    }
  };

  return (
    <div className="pb-32 relative min-h-[50vh] p-4">
      <SimpleToast message={toast?.msg || null} type={toast?.type} onClose={() => setToast(null)} />
      
      {/* LOADING OVERLAY */}
      {depositStatus && ( 
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl flex flex-col items-center gap-4 shadow-2xl">
                <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="font-bold text-yellow-500 animate-pulse">{depositStatus}</div>
            </div>
        </div> 
      )}

      {/* HEADER */}
      <div className="p-5 bg-gradient-to-br from-yellow-900 to-amber-900 text-white rounded-2xl shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute top-4 right-4 text-[10px] px-2 py-1 rounded-full border border-white/20 bg-black/20 font-medium flex items-center gap-1 backdrop-blur-md">
           <Wallet className="w-3 h-3" /> <span className="truncate max-w-[120px]">{accountType}</span>
        </div>
        <div className="flex items-center gap-2 text-yellow-200 text-xs mb-1">
            <Flash className="w-3 h-3" /> Dust Sweeper
        </div>
        <h2 className="text-xl font-bold mb-2">Swap Dust to ETH</h2>
        <div className="flex items-center justify-between mt-4">
             <code className="text-[10px] opacity-60 font-mono">{vaultAddress || "Connecting..."}</code>
             <button onClick={() => vaultAddress && navigator.clipboard.writeText(vaultAddress)}>
                 <Copy className="w-3 h-3 hover:text-white" />
             </button>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-3">
            <h3 className="font-semibold text-zinc-700 dark:text-zinc-300">Assets ({tokens.length})</h3>
            {tokens.length > 0 && ( 
                <button onClick={toggleSelectAll} className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">
                    {selectedTokens.size === tokens.length ? "Deselect All" : "Select All"}
                </button> 
            )}
        </div>
        <button 
            onClick={fetchVaultData} 
            className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:rotate-180 transition-all duration-500"
        >
            <Refresh className="w-4 h-4 text-zinc-500" />
        </button>
      </div>

      {/* TOKEN LIST */}
      <div className="space-y-3">
        {loading ? ( 
            <div className="text-center py-10 text-zinc-400 animate-pulse">Scanning Vault...</div> 
        ) : tokens.length === 0 ? ( 
            <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800">
               <div className="text-zinc-400 text-sm mb-1">No dust tokens found.</div>
               <div className="text-xs text-zinc-300">Deposit tokens to your Vault first.</div>
            </div> 
        ) : (
            tokens.map((token, i) => {
                const isSelected = selectedTokens.has(token.contractAddress);
                return (
                    <div 
                        key={i} 
                        onClick={() => toggleSelect(token.contractAddress)} 
                        className={`flex items-center justify-between p-4 border rounded-2xl shadow-sm cursor-pointer transition-all duration-200 active:scale-[0.98] ${
                            isSelected 
                            ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800" 
                            : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300"
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${isSelected ? "bg-yellow-500 border-yellow-500" : "bg-white border-zinc-300"}`}>
                                {isSelected && <Check className="w-4 h-4 text-white" />}
                            </div>

                            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden border border-zinc-200">
                                <TokenLogo token={token} />
                            </div>
                            
                            <div>
                                <div className="font-bold text-sm">{token.symbol}</div>
                                <div className="text-xs text-zinc-500 font-mono">{parseFloat(token.formattedBal).toFixed(6)}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-50">
                            <ArrowRight className="w-4 h-4 text-zinc-300" />
                            <div className="text-xs font-bold text-zinc-400">ETH</div>
                        </div>
                    </div>
                );
            })
        )}
      </div>

      {/* FAB */}
      {selectedTokens.size > 0 && (
          <div className="fixed bottom-24 left-4 right-4 z-40 animate-in slide-in-from-bottom-5">
            <button 
                onClick={handleBatchSwap} 
                className="w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 text-white shadow-xl py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
            >
                <Flash className="w-5 h-5" /> Batch Swap {selectedTokens.size} Assets
            </button>
          </div>
      )}
    </div>
  );
};