"use client";

import { useEffect, useState } from "react";
import { useWalletClient } from "wagmi"; 
import { Copy, Refresh, ShieldCheck } from "iconoir-react"; 

import { getUnifiedSmartAccountClient } from "~/lib/smart-account-switcher";
import { publicClient } from "~/lib/smart-account"; // Import dari file baru
import { useFrameContext } from "~/components/providers/frame-provider";

import { SimpleAccountDeposit } from "./simple-account-deposit";
import { TokenList } from "./token-list";

export const DustDepositView = () => {
  const { data: walletClient } = useWalletClient();
  const frameContext = useFrameContext();
  
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshStatus = async () => {
      if (!walletClient) return;
      setLoading(true);
      try {
        const client = await getUnifiedSmartAccountClient(walletClient, undefined);
        const addr = client.account.address;
        setVaultAddress(addr);
      } catch (e) { console.error("Status Check Error:", e); }
      finally { setLoading(false); }
  };

  useEffect(() => { if (walletClient) refreshStatus(); }, [walletClient]); 

  if (!frameContext) return <div className="text-center py-20 text-zinc-500 text-xs animate-pulse">Initializing...</div>;

  return (
    <div className="max-w-md mx-auto pb-24">
       {/* HEADER SIMPLE */}
       <div className="text-center mb-6 pt-4">
          <div className="flex justify-center mb-2">
             <div className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center gap-1.5 border border-blue-200 dark:border-blue-800">
                <ShieldCheck className="w-3 h-3"/> Unified Vault
             </div>
          </div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Active Vault Address</div>
          <div className="text-xl font-mono font-bold flex justify-center items-center gap-2">
             {loading ? <Refresh className="w-5 h-5 animate-spin"/> : (vaultAddress ? (vaultAddress.slice(0,6) + "..." + vaultAddress.slice(-4)) : "...")}
             {vaultAddress && <Copy className="w-4 h-4 text-zinc-500 cursor-pointer hover:text-white" onClick={() => navigator.clipboard.writeText(vaultAddress)}/>}
          </div>
       </div>

       <div className="animate-in fade-in duration-500">
           {/* HANYA Form Deposit (Simpel) */}
           <SimpleAccountDeposit 
              vaultAddress={vaultAddress} 
              isDeployed={true} // Selalu true di UI ini agar bersih
              onUpdate={refreshStatus} 
           />
       </div>

       <TokenList address={vaultAddress} />
    </div>
  );
};