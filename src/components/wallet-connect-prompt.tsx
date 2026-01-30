"use client";

import { useConnect } from "wagmi";
import { Wallet } from "iconoir-react";

export const WalletConnectPrompt = () => {
  const { connect, connectors } = useConnect();

  // Ambil connector pertama (biasanya Injected atau Coinbase)
  const primaryConnector = connectors[0];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 animate-in fade-in zoom-in duration-300">
      <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-2">
         <Wallet className="w-8 h-8 text-blue-600 dark:text-blue-400" />
      </div>
      
      <div className="space-y-1">
        <h3 className="text-xl font-bold">Connect to Start</h3>
        <p className="text-zinc-500 text-sm max-w-[250px] mx-auto">
          Login with Base App or Farcaster to access your Smart Vault.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
          {connectors.map((connector) => (
            <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95"
            >
                Connect {connector.name}
            </button>
          ))}
      </div>
    </div>
  );
};