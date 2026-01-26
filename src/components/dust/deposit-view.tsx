"use client";

import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { Copy, Refresh } from "iconoir-react";

// IMPORT KEDUA LIBRARY (HYBRID)
import { getCoinbaseSmartAccountClient, coinbasePublicClient } from "~/lib/coinbase-smart-account";
import { getZeroDevSmartAccountClient, publicClient as standardPublicClient } from "~/lib/zerodev-smart-account";

import { SimpleAccountDeposit } from "./simple-account-deposit";
import { SmartAccountDeposit } from "./smart-account-deposit";

type VaultMode = "COINBASE" | "STANDARD";

export const DustDepositView = () => {
  const { connector } = useAccount();
  const { data: walletClient } = useWalletClient();

  // STATE MODE (Hybrid Switcher)
  const [mode, setMode] = useState<VaultMode>("COINBASE"); // Default Coinbase

  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [isDeployed, setIsDeployed] = useState(false);
  const [loading, setLoading] = useState(false);

  // LOGIC UTAMA: SWITCHER ADDRESS
  const refreshStatus = async () => {
      if (!walletClient) return;
      setLoading(true);
      try {
        let addr, code, bal;

        if (mode === "COINBASE") {
            // JALUR 1: COINBASE (Sistem A)
            const client = await getCoinbaseSmartAccountClient(walletClient);
            addr = client.account.address;
            code = await coinbasePublicClient.getBytecode({ address: addr });
            bal = await coinbasePublicClient.getBalance({ address: addr });
        } else {
            // JALUR 2: STANDARD SIMPLE ACCOUNT (Sistem B)
            const client = await getZeroDevSmartAccountClient(walletClient);
            addr = client.account.address;
            code = await standardPublicClient.getBytecode({ address: addr });
            bal = await standardPublicClient.getBalance({ address: addr });
        }

        setVaultAddress(addr);
        setIsDeployed(code !== undefined && code !== null && code !== "0x");
        setVaultBalance(bal);
        
      } catch (e) { console.error("Status Check Error:", e); }
      finally { setLoading(false); }
  };

  useEffect(() => {
    refreshStatus();
  }, [walletClient, mode]); // Refresh saat wallet ATAU mode berubah

  return (
    <div className="max-w-md mx-auto pb-24">
       
       {/* --- SWITCHER UI --- */}
       <div className="flex bg-zinc-900 p-1 rounded-xl mb-6 border border-zinc-800">
          <button 
            onClick={() => setMode("COINBASE")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === "COINBASE" ? "bg-blue-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            System A: Coinbase
          </button>
          <button 
            onClick={() => setMode("STANDARD")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === "STANDARD" ? "bg-purple-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            System B: Standard
          </button>
       </div>

       {/* HEADER INFO */}
       <div className="text-center mb-6">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
            {mode === "COINBASE" ? "Coinbase Smart Wallet" : "Simple Account (Pimlico)"}
          </div>
          <div className="text-2xl font-mono font-bold flex justify-center items-center gap-2">
             {loading ? <Refresh className="w-5 h-5 animate-spin"/> : (vaultAddress?.slice(0,6) + "..." + vaultAddress?.slice(-4))}
             {vaultAddress && <Copy className="w-4 h-4 text-zinc-500 cursor-pointer" onClick={() => navigator.clipboard.writeText(vaultAddress)}/>}
          </div>
       </div>

       {/* --- RENDER COMPONENTS BERDASARKAN MODE --- */}
       
       {mode === "COINBASE" ? (
           // SISTEM A: COINBASE (Pakai Factory Lama)
           <SimpleAccountDeposit 
              vaultAddress={vaultAddress} 
              isDeployed={isDeployed} 
              onUpdate={refreshStatus} 
           />
       ) : (
           // SISTEM B: STANDARD (Pakai Factory Baru + Withdraw UserOp)
           <>
             {/* Component Deposit utk Standard */}
             <div className="p-4 bg-zinc-800/50 rounded-xl mb-4 border border-zinc-700 text-center text-xs text-zinc-400">
                Deposit ETH Mainnet ke alamat di atas untuk test Gasless Withdraw.
             </div>
             
             {vaultAddress && (
               <SmartAccountDeposit 
                  vaultAddress={vaultAddress} 
                  isDeployed={isDeployed} 
                  balance={vaultBalance}
                  onUpdate={refreshStatus}
               />
             )}
           </>
       )}
    </div>
  );
};