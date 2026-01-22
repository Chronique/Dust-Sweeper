"use client";

import { createConfig, http, WagmiProvider } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { coinbaseWallet, injected } from "wagmi/connectors";
import type { ReactNode } from "react";

const queryClient = new QueryClient();

const config = createConfig({
  // 🔥 Default ke Base Sepolia (Urutan 0)
  chains: [baseSepolia, base], 
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
  },
  connectors: [
    // 🔥 Preference 'all' membiarkan user memilih (Mobile/Extension/Smart Wallet)
    coinbaseWallet({
      appName: "Nyawit",
      preference: "all" as any, 
    }),
    injected(), // Fallback untuk MetaMask biasa
  ],
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}