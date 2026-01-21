"use client";

import { createConfig, http, WagmiProvider } from "wagmi";
import { base, baseSepolia } from "wagmi/chains"; // 🔥 Import baseSepolia
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { coinbaseWallet } from "wagmi/connectors";
import type { ReactNode } from "react";

// Setup QueryClient
const queryClient = new QueryClient();

// Setup Wagmi Config
const config = createConfig({
  // 🔥 Masukkan baseSepolia ke dalam array chains
  chains: [base, baseSepolia], 
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
  connectors: [
    coinbaseWallet({
      appName: "Nyawit",
      preference: "smartWalletOnly",
    }),
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