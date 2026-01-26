"use client";

import { useState } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi"; // 👈 WAJIB: useWalletClient
import { parseEther, formatEther, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { getUnifiedSmartAccountClient } from "~/lib/smart-account-switcher"; 
import { SimpleToast } from "~/components/ui/simple-toast";
import { ArrowUp, CheckCircle } from "iconoir-react";

export const SmartAccountDeposit = ({ vaultAddress, isDeployed, balance, onUpdate }: { vaultAddress: string | null, isDeployed: boolean, balance: bigint, onUpdate: () => void }) => {
  const { address: owner, connector, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  
  // 🔥 FIX 1: Ambil object wallet yang benar dari Wagmi
  const { data: walletClient } = useWalletClient(); 
  
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [toast, setToast] = useState<{msg:string, type:"success"|"error"}|null>(null);

  const handleWithdraw = async () => {
    // 1. Validasi: Pastikan walletClient sudah siap
    if (!walletClient || !owner || !vaultAddress || !amount) {
        setToast({ msg: "Wallet not ready. Please wait...", type: "error" });
        return;
    }
    
    if (parseEther(amount) > balance) {
        setToast({ msg: "Saldo Vault Kurang!", type: "error" });
        return;
    }

    setLoading(true);
    try {
      if (chainId !== baseSepolia.id) await switchChainAsync({ chainId: baseSepolia.id });

      console.log("🤖 [SmartAccount] Initializing Client...");
      
      // 🔥 FIX 2: Kirim 'walletClient' yang valid (bukan window.ethereum)
      const client = await getUnifiedSmartAccountClient(walletClient, connector?.id, 0n);
      
      console.log("🚀 [SmartAccount] Sending Withdraw UserOp...");
      
      // 3. KIRIM USEROP
      const hash = await client.sendUserOperation({
        account: client.account!,
        calls: [{ 
            to: owner as Address, 
            value: parseEther(amount), 
            data: "0x" 
        }]
      });

      console.log("✅ UserOp Hash:", hash);
      
      // 4. TUNGGU BUNDLER
      await client.waitForUserOperationReceipt({ hash });
      
      setToast({ msg: "Withdraw Berhasil! 💸", type: "success" });
      setAmount("");
      onUpdate();
    } catch (e: any) {
      console.error("WITHDRAW ERROR:", e);
      let msg = e.shortMessage || e.message;
      if(msg.includes("null")) msg = "Wallet Data Error (Types Null)";
      setToast({ msg: "Withdraw Gagal: " + msg, type: "error" });
    } finally { setLoading(false); }
  };

  if (!isDeployed) return null; 

  return (
    <div className="p-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-2xl">
      <SimpleToast 
        message={toast?.msg ?? null} 
        type={toast?.type ?? undefined} 
        onClose={() => setToast(null)} 
      />
      
      <div className="flex justify-between items-center mb-4">
         <div className="text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2"><ArrowUp className="w-4 h-4"/> 2. Smart Wallet (Vault)</div>
         <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Vault Balance</div>
            <div className="font-mono font-bold text-lg">{parseFloat(formatEther(balance)).toFixed(5)} ETH</div>
         </div>
      </div>

      <div className="space-y-3">
         <div className="relative">
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.0" className="w-full pl-3 pr-16 py-3 rounded-xl border dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            <button onClick={() => setAmount(formatEther(balance))} className="absolute right-2 top-2 bottom-2 px-3 text-xs font-bold bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200 rounded-lg">MAX</button>
         </div>
         
         <button onClick={handleWithdraw} disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 transition-all">
            {loading ? "Signing UserOp..." : "Withdraw (Gas Sponsored)"}
         </button>
         
         <div className="flex items-center gap-2 justify-center text-[10px] text-green-600">
            <CheckCircle className="w-3 h-3"/> Sponsored by Pimlico Paymaster
         </div>
      </div>
    </div>
  );
};