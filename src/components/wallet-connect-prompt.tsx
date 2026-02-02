"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Wallet } from "lucide-react"; // Ganti icon jadi Wallet lagi

export const WalletConnectPrompt = () => {
  const { login, ready } = usePrivy();

  const handleConnect = () => {
    // [FIX] Panggil login() tanpa argumen khusus agar muncul pilihan "Connect Wallet"
    // atau force list: ['wallet', 'email']
    login({ loginMethods: ['wallet', 'email'] });
  };

  if (!ready) return (
    <div className="flex flex-col items-center justify-center py-20 text-zinc-500 animate-pulse gap-2">
       <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
       <span className="text-xs">Preparing Connection...</span>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 animate-in fade-in zoom-in duration-300">
      <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-2">
         <Wallet className="w-8 h-8 text-blue-600 dark:text-blue-400" />
      </div>
      
      <div className="space-y-1">
        <h3 className="text-xl font-bold">Connect Wallet</h3>
        <p className="text-zinc-500 text-sm max-w-[250px] mx-auto">
          Connect Rabby (Farcaster Import) to access your existing Vault.
        </p>
      </div>

      <button
        onClick={handleConnect}
        className="mt-4 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center gap-2"
      >
        <Wallet className="w-4 h-4" />
        Connect Wallet
      </button>
    </div>
  );
};