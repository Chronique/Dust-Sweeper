"use client";

import { usePrivy } from "@privy-io/react-auth";
import { TopBar } from "~/components/top-bar";
import { WalletConnectPrompt } from "~/components/wallet-connect-prompt";
import Demo from "~/components/demo"; // Pastikan ini path ke komponen Tabs (Dust) Anda
import SignIn from "~/components/actions/signin"; // Komponen Seamless Context

export default function App() {
  const { ready, authenticated } = usePrivy();

  // 1. Tampilkan TopBar (Logo & Context Profile) selalu ada agar terlihat "Seamless"
  // tapi fitur wallet (Demo) kita sembunyikan dulu.
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 pb-20">
      <TopBar />
      
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Tampilkan Info User Farcaster (Seamless) */}
        <SignIn />

        {/* GERBANG UTAMA: */}
        {/* Jika Privy belum siap atau belum login -> Tampilkan Tombol Connect */}
        {!ready || !authenticated ? (
           <WalletConnectPrompt />
        ) : (
           /* Jika SUDAH Login -> Baru tampilkan fitur Dust (Deposit/Swap/Vault) */
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <Demo /> 
           </div>
        )}
      </main>
    </div>
  );
}