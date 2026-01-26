"use client";

import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { getUnifiedSmartAccountClient } from "~/lib/smart-account-switcher"; 
import { publicClient } from "~/lib/coinbase-smart-account"; 
// Import komponen baru
import { SimpleAccountDeposit } from "./simple-account-deposit";
import { SmartAccountDeposit } from "./smart-account-deposit";

export const DustDepositView = () => {
  const { connector } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [isDeployed, setIsDeployed] = useState(false);

  // LOGIC CHECK STATUS (Read Only)
  const refreshStatus = async () => {
      if (!walletClient) return;
      try {
        const client = await getUnifiedSmartAccountClient(walletClient, connector?.id, 0n);
        if (!client.account) return;
        
        const addr = client.account.address;
        setVaultAddress(addr);

        const code = await publicClient.getBytecode({ address: addr });
        setIsDeployed(code !== undefined && code !== null && code !== "0x");

        const bal = await publicClient.getBalance({ address: addr });
        setVaultBalance(bal);
      } catch (e) { console.error("Status Check Error:", e); }
  };

  useEffect(() => {
    refreshStatus();
    const i = setInterval(refreshStatus, 10000);
    return () => clearInterval(i);
  }, [walletClient]);

  return (
    <div className="max-w-md mx-auto pb-24">
       {/* 1. BAGIAN EOA (STABIL - DEPLOY & DEPOSIT) */}
       <SimpleAccountDeposit 
          vaultAddress={vaultAddress} 
          isDeployed={isDeployed} 
          onUpdate={refreshStatus} 
       />

       {/* 2. BAGIAN SMART WALLET (DEV - WITHDRAW/USEROP) */}
       {vaultAddress && (
           <SmartAccountDeposit 
              vaultAddress={vaultAddress} 
              isDeployed={isDeployed} 
              balance={vaultBalance}
              onUpdate={refreshStatus}
           />
       )}
    </div>
  );
};