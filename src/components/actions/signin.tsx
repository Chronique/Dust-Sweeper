"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Button } from "~/components/ui/button";

export default function SignIn() {
  const [context, setContext] = useState<Awaited<typeof sdk.context> | null>(null);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx);
      } catch (e) {
        console.error("Failed to load context:", e);
      }
    };
    loadContext();
  }, []);

  if (context?.user) {
    return (
      <div className="flex flex-col items-center justify-center p-6 space-y-4 animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-green-500 shadow-lg shadow-green-500/20">
          {context.user.pfpUrl ? (
            <img 
              src={context.user.pfpUrl} 
              alt={context.user.username} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />
          )}
        </div>
        
        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
            Welcome, @{context.user.username}!
          </h3>
          <p className="text-xs text-zinc-500 font-mono bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded-md">
            FID: {context.user.fid}
          </p>
        </div>

        <Button 
          onClick={() => sdk.actions.close()} 
          variant="outline"
          className="w-full"
        >
          Close MiniApp
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="animate-pulse">
        <div className="h-12 w-12 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-4" />
        <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded mx-auto" />
      </div>
      <p className="text-sm text-zinc-500">Loading Farcaster Profile...</p>
    </div>
  );
}