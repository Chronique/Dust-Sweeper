"use client";

import { WagmiProvider } from "~/components/providers/wagmi-provider";
import { FrameProvider } from "~/components/providers/frame-provider";
import { ErudaProvider } from "~/components/providers/eruda-provider";
import { AppDialogProvider } from "~/components/ui/app-dialog";
import { YieldProvider } from "@yo-protocol/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider>
      <QueryClientProvider client={queryClient}>
        <YieldProvider>
          <FrameProvider>
            <ErudaProvider>
              <AppDialogProvider>
                {children}
              </AppDialogProvider>
            </ErudaProvider>
          </FrameProvider>
        </YieldProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
