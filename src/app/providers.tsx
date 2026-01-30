"use client";

import { WagmiProvider } from "~/components/providers/wagmi-provider";
import { FrameProvider } from "~/components/providers/frame-provider";
// [FIX] Uncomment ErudaProvider
import { ErudaProvider } from "~/components/providers/eruda-provider"; 

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider>
      <FrameProvider>
        {/* [FIX] Bungkus aplikasi dengan ErudaProvider agar muncul tombol debug di mobile */}
        <ErudaProvider>
          {children}
        </ErudaProvider>
      </FrameProvider>
    </WagmiProvider>
  );
}