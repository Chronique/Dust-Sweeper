"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

// [FIX] Ambil tipe Context secara otomatis dari SDK
// Ini menghindari error "Namespace as Type"
type FrameContext = Awaited<typeof sdk.context>;

interface FrameContextValue {
  context: FrameContext | null;
  isInMiniApp: boolean;
}

const FrameContext = createContext<FrameContextValue | undefined>(undefined);

export function FrameProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<FrameContext | null>(null);
  const [isInMiniApp, setIsInMiniApp] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const contextData = await sdk.context;
        setContext(contextData);
        
        // Cek apakah running di MiniApp
        const isMiniApp = await sdk.isInMiniApp();
        setIsInMiniApp(isMiniApp);
        
        sdk.actions.ready();
      } catch (e) {
        console.error("Failed to load Farcaster Context:", e);
      }
    };

    if (sdk) {
      load();
    }
  }, []);

  return (
    <FrameContext.Provider value={{ context, isInMiniApp }}>
      {children}
    </FrameContext.Provider>
  );
}

export function useFrameContext() {
  return useContext(FrameContext);
}