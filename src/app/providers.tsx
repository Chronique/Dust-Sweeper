"use client";

import { WagmiProvider } from "~/components/providers/wagmi-provider";
import { FrameProvider } from "~/components/providers/frame-provider";
// import { FrameProvider } from "~/components/providers/frame-provider"; 

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider>
      {/* FrameProvider dihapus, langsung children */}
      {children}
    </WagmiProvider>
  );
}