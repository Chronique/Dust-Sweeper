"use client";

import { createConfig, http, WagmiProvider as WagmiProviderLib } from "wagmi";
import { base } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { coinbaseWallet, injected } from "wagmi/connectors";

// 1. Setup Query Client
const queryClient = new QueryClient();

// 2. Setup Wagmi Config
const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [
    // Prioritas 1: Coinbase Wallet (Untuk Base App)
    coinbaseWallet({ 
        appName: "Nyawit",
        // [FIX] Sesuaikan format preference dengan tipe object yang diminta error
        preference: {
            options: "smartWalletOnly" 
        } as any // Gunakan 'as any' untuk keamanan jika type definition library tidak stabil
    }),
    // Prioritas 2: Injected (Untuk Farcaster / Metamask / Rabby)
    injected(),
  ],
});

export const WagmiProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProviderLib config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProviderLib>
  );
};