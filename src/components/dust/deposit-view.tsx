"use client";

import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWalletClient, useSendTransaction, useSwitchChain } from "wagmi";
import { useSendCalls } from "wagmi"; 

import { getUnifiedSmartAccountClient } from "~/lib/smart-account-switcher";
import { publicClient } from "~/lib/simple-smart-account"; 
import { fetchMoralisTokens } from "~/lib/moralis-data";
import { formatUnits, erc20Abi, type Address, encodeFunctionData, parseEther, formatEther } from "viem";
import { baseSepolia } from "viem/chains"; 
import { Copy, Wallet, CheckCircle, Circle, NavArrowLeft, NavArrowRight, ArrowUp, Rocket, Check, Refresh, ArrowDown, Coins, WarningTriangle, Flash } from "iconoir-react";
import { SimpleToast } from "~/components/ui/simple-toast";

interface TokenData {
  contractAddress: string;
  name: string;
  symbol: string;
  balance: string;
  rawBalance: string;
  decimals: number;
  logo: string | null;
}

export const DustDepositView = () => {
  const { address: ownerAddress, connector, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain(); 
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { sendCallsAsync } = useSendCalls(); 

  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [vaultEthBalance, setVaultEthBalance] = useState<bigint>(0n);
  const [isDeployed, setIsDeployed] = useState(false);
  const [activating, setActivating] = useState(false);

  // UI STATE
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [depositEthAmount, setDepositEthAmount] = useState<string>("");

  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string, type: "success" | "error" } | null>(null);
  
  // 1. INIT VAULT
  const checkVaultStatus = async () => {
      if (!walletClient) return;
      try {
        const client = await getUnifiedSmartAccountClient(walletClient, connector?.id);
        if (!client.account) return;

        const vAddr = client.account.address;
        setVaultAddress(vAddr);

        const code = await publicClient.getBytecode({ address: vAddr });
        setIsDeployed(code !== undefined && code !== null && code !== "0x");

        const bal = await publicClient.getBalance({ address: vAddr });
        setVaultEthBalance(bal);

      } catch (e) { console.error(e); }
  };

  useEffect(() => {
    checkVaultStatus();
    const interval = setInterval(checkVaultStatus, 10000); 
    return () => clearInterval(interval);
  }, [walletClient, connector?.id]);

  // HELPER: FORCE CHAIN SWITCH
  const ensureSepolia = async () => {
      if (chainId !== baseSepolia.id) {
          try {
              await switchChainAsync({ chainId: baseSepolia.id });
          } catch (e) {
              setToast({ msg: "Please switch to Base Sepolia", type: "error" });
              throw new Error("Wrong Network");
          }
      }
  };

  // 🔥 0. ACTIVATE / DEPLOY VAULT
  // Ini diperlukan agar contract terbentuk, sehingga bisa di-Direct Withdraw
  const handleActivate = async () => {
      if (!walletClient || !vaultAddress) return;
      setActivating(true);
      setDepositStatus("Deploying...");
      try {
          const client = await getUnifiedSmartAccountClient(walletClient, connector?.id);
          
          // Kirim 0 ETH ke diri sendiri via UserOp -> Ini memicu Factory Deploy
          const hash = await client.sendUserOperation({
              account: client.account!,
              calls: [{ to: vaultAddress as Address, value: 0n, data: "0x" }]
          });

          console.log("Deploy Hash:", hash);
          setToast({ msg: "Vault Deployed! 🚀", type: "success" });
          
          await new Promise(r => setTimeout(r, 5000));
          await checkVaultStatus();

      } catch (e: any) {
          console.error(e);
          setToast({ msg: "Deploy Failed", type: "error" });
      } finally {
          setActivating(false);
          setDepositStatus(null);
      }
  };

  // --- LOGIC PERSENTASE WITHDRAW ---
  const handleSetPercent = (percent: number) => {
      if (vaultEthBalance === 0n) return;
      let amount: bigint;
      if (percent === 100) {
          const buffer = parseEther("0.00005"); 
          amount = vaultEthBalance > buffer ? vaultEthBalance - buffer : 0n;
      } else {
          amount = (vaultEthBalance * BigInt(percent)) / 100n;
      }
      setWithdrawAmount(formatEther(amount));
  };

  // 🔥 2. MANUAL ETH DEPOSIT
  const handleManualDepositEth = async () => {
    if (!walletClient || !vaultAddress || !depositEthAmount) return;

    try {
        await ensureSepolia(); 

        const amountWei = parseEther(depositEthAmount);
        const maxLimit = parseEther("0.005");

        if (amountWei > maxLimit) {
            setToast({ msg: "Max Deposit Limit is 0.005 ETH", type: "error" });
            return;
        }
        if (amountWei <= 0n) {
            setToast({ msg: "Enter valid amount", type: "error" });
            return;
        }

        setDepositStatus("Sending ETH...");
        
        const hash = await sendTransactionAsync({
            to: vaultAddress as Address,
            value: amountWei,
            chainId: baseSepolia.id 
        });

        console.log("Deposit Hash:", hash);
        setToast({ msg: "ETH Sent to Vault!", type: "success" });
        setDepositEthAmount("");
        setDepositStatus(null);
        
        await new Promise(r => setTimeout(r, 5000));
        await checkVaultStatus();

    } catch (e: any) {
        console.error(e);
        setDepositStatus(null);
        setToast({ msg: "Deposit Failed / Wrong Network", type: "error" });
    }
  };

  // 🔥 3. DIRECT WITHDRAWAL
  const handleWithdraw = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || !withdrawAmount) return;
    
    // Safety Check: Harus deploy dulu
    if (!isDeployed) {
        setToast({ msg: "Activate Vault first!", type: "error" });
        return;
    }

    try {
        await ensureSepolia(); 

        const amountWei = parseEther(withdrawAmount);
        if (amountWei <= 0n) {
            setToast({ msg: "Amount must be > 0", type: "error" });
            return;
        }
        if (amountWei > vaultEthBalance) {
            setToast({ msg: "Insufficient Balance", type: "error" });
            return;
        }

        const isConfirmed = window.confirm(`Withdraw ${withdrawAmount} ETH to owner?`);
        if (!isConfirmed) return;

        setActivating(true);
        
        const executeAbi = [{
            type: 'function',
            name: 'execute',
            inputs: [
                { name: 'target', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'data', type: 'bytes' }
            ],
            outputs: [],
            stateMutability: 'payable'
        }] as const;

        const txHash = await writeContractAsync({
            address: vaultAddress as Address,
            abi: executeAbi,
            functionName: 'execute',
            args: [
                ownerAddress as Address, 
                amountWei,               
                "0x"                     
            ],
            chainId: baseSepolia.id
        });

        console.log("✅ Withdraw Tx Sent:", txHash);
        setToast({ msg: "Withdraw Sent! 💸", type: "success" });
        setWithdrawAmount("");
        
        await new Promise(r => setTimeout(r, 5000));
        await checkVaultStatus();

    } catch (e: any) {
        console.error(e);
        setToast({ msg: "Withdraw Failed: " + (e.shortMessage || e.message), type: "error" });
    } finally {
        setActivating(false);
    }
  };

  // 4. SCAN WALLET & BATCH DEPOSIT
  const scanOwnerWallet = async () => {
      if (!ownerAddress) return;
      setLoading(true);
      try {
        const moralisData = await fetchMoralisTokens(ownerAddress);
        const formattedTokens: TokenData[] = moralisData
          .filter(t => BigInt(t.balance) > 0n)
          .map((t) => ({
              contractAddress: t.token_address,
              name: t.name || "Unknown",
              symbol: t.symbol || "UNK",
              balance: formatUnits(BigInt(t.balance), t.decimals),
              rawBalance: t.balance,
              decimals: t.decimals,
              logo: t.thumbnail || t.logo || null 
          }));
        setTokens(formattedTokens);
      } catch (error) { console.error(error); setToast({ msg: "Failed to scan wallet", type: "error" }); } finally { setLoading(false); }
  };
  useEffect(() => { if (ownerAddress) scanOwnerWallet(); }, [ownerAddress]);

  const totalPages = Math.ceil(tokens.length / ITEMS_PER_PAGE);
  const currentTokens = tokens.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const toggleSelect = (address: string) => {
    const newSet = new Set(selectedTokens);
    if (newSet.has(address)) newSet.delete(address); else newSet.add(address);
    setSelectedTokens(newSet);
  };
  const toggleSelectAllPage = () => {
    const newSet = new Set(selectedTokens);
    const allSelected = currentTokens.every(t => newSet.has(t.contractAddress));
    currentTokens.forEach(t => { if (allSelected) newSet.delete(t.contractAddress); else newSet.add(t.contractAddress); });
    setSelectedTokens(newSet);
  };

  const handleBatchDeposit = async () => {
      if (!vaultAddress) return;
      setDepositStatus("Preparing Batch...");
      const isCoinbaseWallet = connector?.id === 'coinbaseWalletSDK';
      try {
        await ensureSepolia(); 

        if (isCoinbaseWallet) {
          setDepositStatus(`Batching ${selectedTokens.size} assets...`);
          const calls = Array.from(selectedTokens).map(tokenAddr => {
              const token = tokens.find(t => t.contractAddress === tokenAddr);
              if (!token) return null;
              return {
                  to: tokenAddr as Address,
                  data: encodeFunctionData({
                      abi: erc20Abi,
                      functionName: 'transfer',
                      args: [vaultAddress as Address, BigInt(token.rawBalance)]
                  }),
                  value: 0n
              };
          }).filter(Boolean) as any[];
          await sendCallsAsync({ calls });
          setDepositStatus("Batch Transaction Sent!");
        } else {
          for (const tokenAddr of selectedTokens) {
              const token = tokens.find(t => t.contractAddress === tokenAddr);
              if (!token) continue;
              setDepositStatus(`Depositing ${token.symbol}...`);
              await writeContractAsync({
                  address: tokenAddr as Address,
                  abi: erc20Abi,
                  functionName: "transfer",
                  args: [vaultAddress as Address, BigInt(token.rawBalance)],
                  chainId: baseSepolia.id
              });
          }
        }
        setDepositStatus("Confirming...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        await scanOwnerWallet();
        setSelectedTokens(new Set());
        setDepositStatus(null);
        setToast({ msg: "Batch Deposit Successful!", type: "success" });
      } catch (e: any) {
        console.error(e);
        setDepositStatus(null);
        setToast({ msg: "Batch Deposit Failed", type: "error" });
      }
  };

  return (
    <div className="pb-24 relative min-h-[50vh]">
      <SimpleToast message={toast?.msg || null} type={toast?.type} onClose={() => setToast(null)} />

      {/* LOADING OVERLAY */}
      {(depositStatus || activating) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 max-w-[200px]">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-sm font-bold text-center animate-pulse">{activating ? "Processing..." : depositStatus}</div>
           </div>
        </div>
      )}

      {/* HEADER: VAULT ADDRESS & SMALL DEPLOY BUTTON */}
      <div className="p-5 bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl shadow-lg mb-6 relative overflow-hidden">
        
        {/* BUTTON AKTIVASI KECIL (Hanya muncul kalau belum deploy) */}
        {!isDeployed && (
            <div className="absolute top-4 right-4">
                <button 
                    onClick={handleActivate}
                    disabled={activating}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-[10px] font-bold text-yellow-300 transition-all animate-pulse"
                >
                    <Flash className="w-3 h-3" />
                    Activate
                </button>
            </div>
        )}

        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
          <Wallet className="w-3 h-3" /> Smart Vault Address
        </div>
        <div className="flex items-center justify-between">
          <code className="text-sm font-mono opacity-90 truncate max-w-[200px]">
            {vaultAddress || "Generating..."}
          </code>
          <button onClick={() => { if (vaultAddress) { navigator.clipboard.writeText(vaultAddress); setToast({ msg: "Address Copied!", type: "success" }); } }}>
            <Copy className="w-4 h-4 hover:text-blue-400 transition-colors" />
          </button>
        </div>
      </div>

      {/* TAB SWITCHER */}
      <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl mb-6">
        <button 
            onClick={() => setActiveTab("deposit")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "deposit" ? "bg-white dark:bg-zinc-800 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600"}`}
        >
            Deposit
        </button>
        <button 
            onClick={() => setActiveTab("withdraw")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "withdraw" ? "bg-white dark:bg-zinc-800 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600"}`}
        >
            Withdraw
        </button>
      </div>

      {/* ================= VIEW: DEPOSIT ================= */}
      {activeTab === "deposit" && (
        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
            
            {/* MANUAL ETH DEPOSIT */}
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
                        <Coins className="w-4 h-4" /> Deposit ETH
                    </h3>
                    <span className="text-[10px] text-blue-600 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full">Max 0.005 ETH</span>
                </div>
                <div className="flex gap-2">
                    <input 
                        type="number" 
                        placeholder="0.001" 
                        value={depositEthAmount}
                        onChange={(e) => setDepositEthAmount(e.target.value)}
                        className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                    />
                    <button 
                        onClick={handleManualDepositEth}
                        disabled={!depositEthAmount || parseFloat(depositEthAmount) > 0.005}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors"
                    >
                        Send
                    </button>
                </div>
            </div>

            {/* TOKEN LIST */}
            <div className="flex items-end justify-between mb-3 px-1">
                <div><h3 className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">Wallet Assets <span className="text-xs font-normal text-zinc-400">({tokens.length})</span></h3></div>
                <button onClick={toggleSelectAllPage} className="text-xs font-medium text-blue-600 hover:text-blue-700 mb-1">{currentTokens.every(t => selectedTokens.has(t.contractAddress)) && currentTokens.length > 0 ? "Deselect Page" : "Select Page"}</button>
            </div>

            {loading ? ( <div className="text-center py-10 text-zinc-400 animate-pulse">Scanning wallet...</div> ) : tokens.length === 0 ? ( <div className="text-center py-10 text-zinc-400 border-2 border-dashed rounded-xl">No tokens found.</div> ) : (
                <div className="space-y-2">
                {currentTokens.map((token) => {
                    const isSelected = selectedTokens.has(token.contractAddress);
                    return (
                    <div key={token.contractAddress} onClick={() => toggleSelect(token.contractAddress)} className={`flex items-center p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300"}`}>
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 mr-3 border border-zinc-100 dark:border-zinc-700">
                        {token.logo ? (<img src={token.logo} alt={token.symbol} className="w-full h-full object-cover" />) : (<span className="text-xs font-bold text-zinc-400">{token.symbol[0]}</span>)}
                        </div>
                        <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{token.name}</div>
                        <div className="text-xs text-zinc-500 truncate">{parseFloat(token.balance).toFixed(4)} {token.symbol}</div>
                        </div>
                        <div className="pl-3">{isSelected ? (<CheckCircle className="w-6 h-6 text-blue-600 fill-blue-600/10" />) : (<Circle className="w-6 h-6 text-zinc-300" />)}</div>
                    </div>
                    );
                })}
                </div>
            )}
            
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-6">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30"><NavArrowLeft className="w-5 h-5" /></button>
                <span className="text-sm font-medium text-zinc-500">Page {page} of {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30"><NavArrowRight className="w-5 h-5" /></button>
                </div>
            )}

            {selectedTokens.size > 0 && (
                <div className="fixed bottom-24 left-4 right-4 z-40 animate-in slide-in-from-bottom-5">
                <button onClick={handleBatchDeposit} className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/30 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-transform active:scale-95"><ArrowDown className="w-5 h-5" />Deposit {selectedTokens.size} Assets</button>
                </div>
            )}
        </div>
      )}

      {/* ================= VIEW: WITHDRAW ================= */}
      {activeTab === "withdraw" && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
             <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="text-xs text-zinc-400 mb-1">Vault Balance</div>
                        <div className="text-3xl font-bold font-mono tracking-tight flex items-baseline gap-1">
                            {parseFloat(formatEther(vaultEthBalance)).toFixed(5)} <span className="text-lg text-zinc-500">ETH</span>
                        </div>
                    </div>
                    <button onClick={() => checkVaultStatus()} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors">
                        <Refresh className="w-5 h-5 text-zinc-500" />
                    </button>
                </div>

                {/* WITHDRAW INPUT & PERCENTAGES */}
                <div className="space-y-4">
                    <div className="relative">
                        <input 
                            type="number" 
                            placeholder="0.0" 
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            className="w-full bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-4 text-right font-mono text-lg focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-400"
                        />
                        <div className="absolute left-4 top-4 text-zinc-500 font-bold pointer-events-none">Amount</div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                        {[25, 50, 75, 100].map((pct) => (
                            <button 
                                key={pct}
                                onClick={() => handleSetPercent(pct)}
                                className="bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/5 py-2 rounded-lg text-xs font-bold transition-colors"
                            >
                                {pct === 100 ? "MAX" : `${pct}%`}
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={handleWithdraw}
                        disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || activating}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                        <ArrowUp className="w-5 h-5" />
                        Confirm Withdraw
                    </button>
                </div>
                
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg text-xs text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
                   {!isDeployed ? (
                       <>
                        <WarningTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Vault is not active. Click "Activate" in the top card first!</span>
                       </>
                   ) : (
                       <>
                        <WarningTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Max withdraw leaves 0.00005 ETH to ensure gas safety for future transactions.</span>
                       </>
                   )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};