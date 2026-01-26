"use client";

import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { Copy, Refresh, WarningTriangle, Cube, Wallet } from "iconoir-react";

import { getZeroDevSmartAccountClient, publicClient as zeroDevPublicClient } from "~/lib/zerodev-smart-account";
import { getCoinbaseSmartAccountClient, coinbasePublicClient } from "~/lib/coinbase-smart-account";
import { useFrameContext } from "~/components/providers/frame-provider";

import { SimpleAccountDeposit } from "./simple-account-deposit";
import { SmartAccountDeposit } from "./smart-account-deposit";
import { TokenList } from "./token-list";

export const DustDepositView = () => {
  const { data: walletClient } = useWalletClient();
  const frameContext = useFrameContext();
  
  // State untuk data vault
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [isDeployed, setIsDeployed] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- 1. DETEKSI SISTEM (MODE) ---
  // Jika context belum siap, kita anggap loading dulu
  if (!frameContext) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <div className="w-8 h-8 border-4 border-zinc-300 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
        <p className="text-xs text-zinc-500">Detecting Environment...</p>
      </div>
    );
  }

  const { isInMiniApp } = frameContext;
  
  // LOGIKA UTAMA:
  // Farcaster -> Coinbase (System B)
  // Lainnya (Base App) -> ZeroDev (System A)
  const mode = isInMiniApp ? "COINBASE" : "ZERODEV";

  // --- 2. FUNGSI LOAD DATA ---
  const refreshStatus = async () => {
      if (!walletClient) return;
      setLoading(true);
      try {
        let addr, code, bal;

        if (mode === "ZERODEV") {
            const client = await getZeroDevSmartAccountClient(walletClient);
            addr = client.account.address;
            code = await zeroDevPublicClient.getBytecode({ address: addr });
            bal = await zeroDevPublicClient.getBalance({ address: addr });
        } else {
            const client = await getCoinbaseSmartAccountClient(walletClient);
            addr = client.account.address;
            code = await coinbasePublicClient.getBytecode({ address: addr });
            bal = await coinbasePublicClient.getBalance({ address: addr });
        }

        setVaultAddress(addr);
        setIsDeployed(code !== undefined && code !== null && code !== "0x");
        setVaultBalance(bal);
        
      } catch (e) { console.error("Status Check Error:", e); }
      finally { setLoading(false); }
  };

  useEffect(() => {
    refreshStatus();
  }, [walletClient, mode]);

  return (
    <div className="max-w-md mx-auto pb-24">
       
       {/* WARNING KHUSUS SYSTEM A (Base App / Browser) */}
       {mode === "ZERODEV" && (
         <div className="bg-red-500/10 border border-red-500 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 flex items-start gap-3 animate-pulse">
            <WarningTriangle className="w-6 h-6 shrink-0 mt-0.5" />
            <div className="text-xs font-bold leading-relaxed">
               UNDER DEVELOPMENT.<br/> 
               DO NOT DEPOSIT WITH BASE APP.<br/> 
               PLEASE USE FARCASTER (System B).
            </div>
         </div>
       )}

       {/* HEADER: Menampilkan Sistem yang Aktif Secara Otomatis */}
       <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                mode === "COINBASE" 
                ? "bg-blue-500/10 border-blue-500 text-blue-500" 
                : "bg-purple-500/10 border-purple-500 text-purple-500"
            }`}>
                {mode === "COINBASE" ? <Wallet className="w-3 h-3"/> : <Cube className="w-3 h-3"/>}
                {mode === "COINBASE" ? "System B (Farcaster)" : "System A (ZeroDev)"}
            </div>
          </div>
          
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            Active Vault Address
          </div>
          <div className="text-2xl font-mono font-bold flex justify-center items-center gap-2">
             {loading ? <Refresh className="w-5 h-5 animate-spin"/> : (vaultAddress ? (vaultAddress.slice(0,6) + "..." + vaultAddress.slice(-4)) : "...")}
             {vaultAddress && <Copy className="w-4 h-4 text-zinc-500 cursor-pointer hover:text-white" onClick={() => navigator.clipboard.writeText(vaultAddress)}/>}
          </div>
       </div>

       {/* --- KONTEN OTOMATIS BERDASARKAN SYSTEM --- */}
       
       {mode === "COINBASE" ? (
           // TAMPILAN KHUSUS FARCASTER (System B)
           <div className="animate-in fade-in duration-500">
               <SimpleAccountDeposit 
                  vaultAddress={vaultAddress} 
                  isDeployed={isDeployed} 
                  onUpdate={refreshStatus} 
               />
               
               {vaultAddress && isDeployed && (
                   <SmartAccountDeposit 
                      vaultAddress={vaultAddress} 
                      isDeployed={isDeployed} 
                      balance={vaultBalance}
                      onUpdate={refreshStatus}
                      systemType="COINBASE"
                   />
               )}
           </div>
       ) : (
           // TAMPILAN KHUSUS BASE APP / BROWSER (System A)
           <div className="animate-in fade-in duration-500">
             <div className="p-4 bg-zinc-800/50 rounded-xl mb-4 border border-zinc-700 text-center text-xs text-zinc-400">
                System A Active (Kernel).<br/>Ensure you are on the correct network.
             </div>
             
             {vaultAddress && (
               <SmartAccountDeposit 
                  vaultAddress={vaultAddress} 
                  isDeployed={isDeployed} 
                  balance={vaultBalance}
                  onUpdate={refreshStatus}
                  systemType="ZERODEV"
               />
             )}
           </div>
       )}

       <TokenList address={vaultAddress} />

    </div>
  );
};