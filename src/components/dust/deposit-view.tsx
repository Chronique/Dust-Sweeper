"use client";

import { useEffect, useState } from "react";
import { useAccount, useWalletClient, useSwitchChain, useSendTransaction } from "wagmi";

// 👇 Panggil Switcher Sakti Kita
import { getUnifiedSmartAccountClient } from "~/lib/smart-account-switcher"; 
import { publicClient } from "~/lib/coinbase-smart-account"; 
import { fetchMoralisTokens } from "~/lib/moralis-data";
import { formatUnits, erc20Abi, type Address, encodeFunctionData, parseEther, formatEther } from "viem";
import { baseSepolia } from "viem/chains"; 

import { Copy, Wallet, CheckCircle, Circle, NavArrowLeft, NavArrowRight, ArrowUp, Flash, ArrowDown, Coins, WarningTriangle, Refresh } from "iconoir-react";
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
  const { sendTransactionAsync } = useSendTransaction(); 

  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [vaultEthBalance, setVaultEthBalance] = useState<bigint>(0n);
  const [isDeployed, setIsDeployed] = useState(false);
  const [accountType, setAccountType] = useState("Detecting...");
  const [activating, setActivating] = useState(false);

  // UI STATE
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [depositEthAmount, setDepositEthAmount] = useState<string>("");

  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string, type: "success" | "error" } | null>(null);
  
  // 1. INIT VAULT & CHECK STATUS
  const checkVaultStatus = async () => {
      if (!walletClient) return;
      try {
        const client = await getUnifiedSmartAccountClient(walletClient, connector?.id, 0n);
        if (!client.account) return;

        const vAddr = client.account.address;
        setVaultAddress(vAddr);

        // @ts-ignore
        const isCSW = client.account.source === "coinbaseSmartAccount" || client.account.type === "coinbaseSmartAccount";
        setAccountType(isCSW ? "Coinbase Smart Wallet" : "Simple Account (EOA)");

        // Cek Deployment
        const code = await publicClient.getBytecode({ address: vAddr });
        setIsDeployed(code !== undefined && code !== null && code !== "0x");

        // Cek Saldo
        const bal = await publicClient.getBalance({ address: vAddr });
        setVaultEthBalance(bal);

      } catch (e) { console.error(e); }
  };

  useEffect(() => {
    checkVaultStatus();
    const interval = setInterval(checkVaultStatus, 10000); 
    return () => clearInterval(interval);
  }, [walletClient, connector?.id]);

  // 🔥 2. ACTIVATE VAULT (STRICT USER OP) 🔥
  const handleActivate = async () => {
      if (!walletClient || !vaultAddress || !ownerAddress) return;
      
      setActivating(true);
      setStatusMsg("Checking Network...");

      try {
          // 1. FORCE SWITCH CHAIN DULU (PENTING!)
          // Seringkali error sign terjadi karena wallet ada di chain yg salah
          if (chainId !== baseSepolia.id) {
             await switchChainAsync({ chainId: baseSepolia.id });
             // Tunggu sebentar biar wallet sync
             await new Promise(r => setTimeout(r, 1000));
          }

          setStatusMsg("Preparing UserOp...");

          // 2. Ambil Client (Pastikan Adapter Strict aktif)
          const client = await getUnifiedSmartAccountClient(walletClient, connector?.id, 0n);
          
          console.log("🚀 Sending Deploy UserOp...");
          
          // 3. KIRIM USER OP
          // Target: OWNER (Aman dari revert simulasi)
          // Value: 0
          // Ini akan memicu popup 'Sign Typed Data' di Coinbase Wallet.
          const hash = await client.sendUserOperation({
              account: client.account!,
              calls: [{ 
                  to: ownerAddress as Address, 
                  value: 0n, 
                  data: "0x" 
              }]
          });

          console.log("Deploy Hash:", hash);
          setStatusMsg("Bundling (Please Wait)...");

          const receipt = await client.waitForUserOperationReceipt({ hash });
          console.log("Receipt:", receipt);

          if(receipt.success) {
            setToast({ msg: "Vault Deployed! 🚀", type: "success" });
            setIsDeployed(true);
          } else {
            throw new Error("Deploy Reverted");
          }
          
          await checkVaultStatus();

      } catch (e: any) {
          console.error("DEPLOY ERROR:", e);
          let msg = e.shortMessage || e.message;
          
          if (msg.includes("paymaster")) msg = "Gas Sponsorship Failed";
          if (msg.includes("User rejected")) msg = "Signature Rejected";
          // Kalau masih muncul raw sign, berarti adapter belum ke-load sempurna
          if (msg.includes("raw sign")) msg = "Wallet Error. Please Refresh & Try Again.";
          
          setToast({ msg: "Deploy Failed: " + msg, type: "error" });
      } finally {
          setActivating(false);
          setStatusMsg(null);
      }
  };

  // 🔥 3. MANUAL ETH DEPOSIT (FROM EOA)
  const handleManualDepositEth = async () => {
    if (!walletClient || !vaultAddress || !depositEthAmount) return;
    try {
        if (chainId !== baseSepolia.id) await switchChainAsync({ chainId: baseSepolia.id });
        const amountWei = parseEther(depositEthAmount);
        if (amountWei <= 0n) return;

        setStatusMsg("Depositing ETH...");
        const hash = await sendTransactionAsync({
            to: vaultAddress as Address,
            value: amountWei,
            chainId: baseSepolia.id 
        });

        console.log("Deposit Hash:", hash);
        setToast({ msg: "Deposit Sent!", type: "success" });
        setDepositEthAmount("");
        setTimeout(checkVaultStatus, 4000);
    } catch (e: any) {
        setToast({ msg: "Deposit Failed", type: "error" });
    } finally {
        setStatusMsg(null);
    }
  };

  // 🔥 4. WITHDRAW (USER OP)
  const handleWithdraw = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || !withdrawAmount) return;
    if (!isDeployed) { setToast({ msg: "Activate Vault first!", type: "error" }); return; }
    
    const amountWei = parseEther(withdrawAmount);
    if (amountWei > vaultEthBalance) { setToast({ msg: "Insufficient Balance", type: "error" }); return; }
    
    if (!window.confirm(`Withdraw ${withdrawAmount} ETH?\nGas paid by Vault.`)) return;

    setStatusMsg("Withdrawing...");
    try {
        const client = await getUnifiedSmartAccountClient(walletClient, connector?.id, 0n);
        const hash = await client.sendUserOperation({
            account: client.account!,
            calls: [{ to: ownerAddress as Address, value: amountWei, data: "0x" }]
        });
        
        console.log("Withdraw Hash:", hash);
        setStatusMsg("Bundling...");
        
        await client.waitForUserOperationReceipt({ hash });
        
        setToast({ msg: "Withdraw Success!", type: "success" });
        setWithdrawAmount("");
        checkVaultStatus();
    } catch (e: any) {
        console.error(e);
        setToast({ msg: "Withdraw Failed", type: "error" });
    } finally {
        setStatusMsg(null);
    }
  };

  const handleSetPercent = (percent: number) => {
      if (vaultEthBalance === 0n) return;
      let amount: bigint;
      if (percent === 100) {
          const buffer = parseEther("0.00001"); 
          amount = vaultEthBalance > buffer ? vaultEthBalance - buffer : vaultEthBalance;
      } else { amount = (vaultEthBalance * BigInt(percent)) / 100n; }
      setWithdrawAmount(formatEther(amount));
  };

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
      } catch (error) { console.error(error); } finally { setLoading(false); }
  };
  useEffect(() => { if (ownerAddress) scanOwnerWallet(); }, [ownerAddress]);

  const totalPages = Math.ceil(tokens.length / ITEMS_PER_PAGE);
  const currentTokens = tokens.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const toggleSelect = (address: string) => {
    const newSet = new Set(selectedTokens);
    if (newSet.has(address)) newSet.delete(address); else newSet.add(address);
    setSelectedTokens(newSet);
  };

  const handleBatchDeposit = async () => {
      if (!vaultAddress || selectedTokens.size === 0) return;
      setStatusMsg("Batch Deposit...");
      try {
        if (chainId !== baseSepolia.id) await switchChainAsync({ chainId: baseSepolia.id });
        for (const tokenAddr of selectedTokens) {
             const token = tokens.find(t => t.contractAddress === tokenAddr);
             if (!token) continue;
             await sendTransactionAsync({
                 to: tokenAddr as Address,
                 data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [vaultAddress as Address, BigInt(token.rawBalance)] }),
                 chainId: baseSepolia.id
             });
        }
        setToast({ msg: "Deposit Sent!", type: "success" });
        setSelectedTokens(new Set());
        setTimeout(() => { scanOwnerWallet(); checkVaultStatus(); }, 5000);
      } catch (e: any) { setToast({ msg: "Deposit Failed", type: "error" }); } finally { setStatusMsg(null); }
  };

  return (
    <div className="pb-24 relative min-h-[50vh]">
      <SimpleToast message={toast?.msg || null} type={toast?.type} onClose={() => setToast(null)} />

      {/* LOADING OVERLAY */}
      {(statusMsg || activating) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 max-w-[200px]">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-sm font-bold text-center animate-pulse">{statusMsg || "Processing..."}</div>
           </div>
        </div>
      )}

      {/* HEADER: VAULT ADDRESS */}
      <div className="p-5 bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute top-4 right-4 text-[10px] px-2 py-1 rounded-full border border-white/20 bg-black/20 font-medium flex items-center gap-1">
           <Wallet className="w-3 h-3" /> {accountType}
        </div>
        {!isDeployed && (
             <div className="absolute bottom-4 right-4">
                 <button onClick={handleActivate} disabled={activating} className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg text-xs font-bold transition-all shadow-lg animate-pulse">
                     <Flash className="w-3 h-3 fill-current" /> Activate Now
                 </button>
             </div>
        )}
        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1"><Wallet className="w-3 h-3" /> Smart Vault Address</div>
        <div className="flex items-center justify-between">
          <code className="text-sm font-mono opacity-90 truncate max-w-[200px]">{vaultAddress || "Generating..."}</code>
          <button onClick={() => { if (vaultAddress) { navigator.clipboard.writeText(vaultAddress); setToast({ msg: "Address Copied!", type: "success" }); } }}><Copy className="w-4 h-4 hover:text-blue-400 transition-colors" /></button>
        </div>
        {!isDeployed && ( <div className="mt-2 text-[10px] text-yellow-300 flex items-center gap-1"><WarningTriangle className="w-3 h-3" /> Vault not deployed. Activate to enable Withdrawals.</div> )}
      </div>

      {/* TAB SWITCHER */}
      <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl mb-6">
        <button onClick={() => setActiveTab("deposit")} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "deposit" ? "bg-white dark:bg-zinc-800 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600"}`}>Deposit</button>
        <button onClick={() => setActiveTab("withdraw")} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "withdraw" ? "bg-white dark:bg-zinc-800 shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600"}`}>Withdraw</button>
      </div>

      {/* VIEW: DEPOSIT */}
      {activeTab === "deposit" && (
        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2"><Coins className="w-4 h-4" /> Deposit ETH</h3></div>
                <div className="flex gap-2">
                    <input type="number" placeholder="0.001" value={depositEthAmount} onChange={(e) => setDepositEthAmount(e.target.value)} className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" />
                    <button onClick={handleManualDepositEth} disabled={!depositEthAmount} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors">Send</button>
                </div>
            </div>

            <div className="flex items-end justify-between mb-3 px-1"><div><h3 className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">Wallet Assets <span className="text-xs font-normal text-zinc-400">({tokens.length})</span></h3></div></div>
            {loading ? ( <div className="text-center py-10 text-zinc-400 animate-pulse">Scanning wallet...</div> ) : tokens.length === 0 ? ( <div className="text-center py-10 text-zinc-400 border-2 border-dashed rounded-xl">No tokens found.</div> ) : (
                <div className="space-y-2">
                {currentTokens.map((token) => {
                    const isSelected = selectedTokens.has(token.contractAddress);
                    return (
                    <div key={token.contractAddress} onClick={() => toggleSelect(token.contractAddress)} className={`flex items-center p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300"}`}>
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 mr-3 border border-zinc-100 dark:border-zinc-700">
                        {token.logo ? (<img src={token.logo} alt={token.symbol} className="w-full h-full object-cover" />) : (<span className="text-xs font-bold text-zinc-400">{token.symbol[0]}</span>)}
                        </div>
                        <div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{token.name}</div><div className="text-xs text-zinc-500 truncate">{parseFloat(token.balance).toFixed(4)} {token.symbol}</div></div>
                        <div className="pl-3">{isSelected ? (<CheckCircle className="w-6 h-6 text-blue-600 fill-blue-600/10" />) : (<Circle className="w-6 h-6 text-zinc-300" />)}</div>
                    </div>
                    );
                })}
                </div>
            )}
            {totalPages > 1 && ( <div className="flex justify-center items-center gap-4 mt-6"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30"><NavArrowLeft className="w-5 h-5" /></button><span className="text-sm font-medium text-zinc-500">Page {page} of {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30"><NavArrowRight className="w-5 h-5" /></button></div> )}
            {selectedTokens.size > 0 && ( <div className="fixed bottom-24 left-4 right-4 z-40 animate-in slide-in-from-bottom-5"><button onClick={handleBatchDeposit} className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/30 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-transform active:scale-95"><ArrowDown className="w-5 h-5" />Deposit {selectedTokens.size} Assets</button></div> )}
        </div>
      )}

      {/* VIEW: WITHDRAW */}
      {activeTab === "withdraw" && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
             <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
                <div className="flex justify-between items-end mb-4">
                    <div><div className="text-xs text-zinc-400 mb-1">Vault Balance</div><div className="text-3xl font-bold font-mono tracking-tight flex items-baseline gap-1">{parseFloat(formatEther(vaultEthBalance)).toFixed(5)} <span className="text-lg text-zinc-500">ETH</span></div></div>
                    <button onClick={() => checkVaultStatus()} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors"><Refresh className="w-5 h-5 text-zinc-500" /></button>
                </div>
                <div className="space-y-4">
                    <div className="relative"><input type="number" placeholder="0.0" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="w-full bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-4 text-right font-mono text-lg focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-400" /><div className="absolute left-4 top-4 text-zinc-500 font-bold pointer-events-none">Amount</div></div>
                    <div className="grid grid-cols-4 gap-2">{[25, 50, 75, 100].map((pct) => ( <button key={pct} onClick={() => handleSetPercent(pct)} className="bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/5 py-2 rounded-lg text-xs font-bold transition-colors">{pct === 100 ? "MAX" : `${pct}%`}</button> ))}</div>
                    <button onClick={handleWithdraw} disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || !isDeployed} className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"><ArrowUp className="w-5 h-5" />Confirm Withdraw</button>
                </div>
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg text-xs text-yellow-700 dark:text-yellow-400 flex items-start gap-2">{!isDeployed ? ( <><WarningTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>Vault is not active. Click "Activate" in the top card first!</span></> ) : ( <><CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-green-500" /><span>Withdrawals are processed as UserOps. Gas fees are sponsored by Pimlico/Vault.</span></> )}</div>
            </div>
        </div>
      )}
    </div>
  );
};