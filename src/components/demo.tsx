/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useFrameContext } from "~/components/providers/frame-provider";
import { WalletConnectPrompt } from "~/components/wallet-connect-prompt";

import { DustDepositView } from "~/components/dust/deposit-view";
import { SwapView } from "~/components/dust/swap-view";
import { VaultView } from "~/components/dust/vault-view";
import { TanamView } from "~/components/dust/tanam-view";
import { TopBar } from "~/components/top-bar";
import { BottomNavigation } from "~/components/bottom-navigation";
import { TabType } from "~/types";
import { useProductTour } from "~/hooks/use-product-tour";

import { Map, Flame, Sprout, Wheat, ArrowUpRight } from "lucide-react";

// ── Desktop sidebar nav items ─────────────────────────────────────────────────
const NAV_ITEMS: { tab: TabType; label: string; Icon: any; color: string; activeColor: string; activeBg: string }[] = [
  { tab: "deposit", label: "Blusukan",   Icon: Map,    color: "text-zinc-400", activeColor: "text-zinc-900 dark:text-white",  activeBg: "bg-zinc-100 dark:bg-zinc-800" },
  { tab: "swap",    label: "Bakar Wilayah",  Icon: Flame,  color: "text-zinc-400", activeColor: "text-orange-600",                activeBg: "bg-orange-50 dark:bg-orange-900/20" },
  { tab: "tanam",   label: "Tanam",   Icon: Sprout, color: "text-zinc-400", activeColor: "text-green-600",                 activeBg: "bg-green-50 dark:bg-green-900/20" },
  { tab: "vault",   label: "Panen",  Icon: Wheat,  color: "text-zinc-400", activeColor: "text-yellow-600",                activeBg: "bg-yellow-50 dark:bg-yellow-900/20" },
];

// Tab header copy
const TAB_HEADERS: Record<TabType, { title: string; subtitle: string; titleClass: string }> = {
  deposit: { title: "Blusukan",  subtitle: "Scan wallet kamu dan pindahkan dust token ke Smart Vault.", titleClass: "bg-gradient-to-br from-zinc-900 to-zinc-600 bg-clip-text text-transparent dark:from-white dark:to-zinc-400" },
  swap:    { title: "Bakar Wilayah",   subtitle: "Bakar semua dust token jadi WETH dalam satu transaksi.", titleClass: "text-orange-600" },
  tanam:   { title: "Tanam",   subtitle: "Tanam USDC/WETH/cbBTC ke YO Protocol atau Morpho Blue, panen yield otomatis.", titleClass: "text-green-600" },
  vault:   { title: "Panen",        subtitle: "Kelola dan tarik aset dari Smart Vault kamu.", titleClass: "text-yellow-600" },
};

export default function Demo() {
  const frameContext = useFrameContext();
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<TabType>("deposit");
  const { runTour } = useProductTour(isConnected); // only auto-runs after wallet connected

  const safeAreaTop = (frameContext?.context as any)?.client?.safeAreaInsets?.top ?? 0;
  const header      = TAB_HEADERS[activeTab];

  return (
    <div
      className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
      style={{ paddingTop: safeAreaTop }}
    >

      {/* ════════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (< md)
      ════════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden w-full max-w-lg mx-auto flex flex-col min-h-screen">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
          <TopBar onHelpClick={runTour} />
        </div>

        <main className="flex-1 px-4 py-6 pb-28 space-y-6">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="absolute top-4 right-16 animate-bounce text-blue-500"><ArrowUpRight className="w-8 h-8" /></div>
              <div className="min-h-[60vh] flex flex-col justify-center"><WalletConnectPrompt /></div>
              <div className="space-y-2 max-w-xs mx-auto">
                <h2 className="text-2xl font-bold">Welcome to Nyawit</h2>
                <p className="text-zinc-500">Connect your wallet to access your Smart Vault.</p>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="mb-6 space-y-1">
                <h2 className={`text-2xl font-bold ${header.titleClass}`}>{header.title}</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{header.subtitle}</p>
              </div>
              <div className="relative">
                {activeTab === "deposit" && <DustDepositView />}
                {activeTab === "swap"    && <SwapView onTabChange={setActiveTab} />}
                {activeTab === "tanam"  && <TanamView />}
                {activeTab === "vault"  && <VaultView />}
              </div>
            </div>
          )}
        </main>

        {isConnected && (
          <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center">
            <div className="w-full max-w-lg">
              <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (≥ md)
      ════════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col min-h-screen">

        {/* Desktop top bar — full width */}
        <div className="sticky top-0 z-20 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800/50 px-8 py-3">
          <div className="max-w-7xl mx-auto">
            <TopBar onHelpClick={runTour} />
          </div>
        </div>

        {!isConnected ? (
          /* Not connected — centered prompt */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-6 max-w-md">
              <WalletConnectPrompt />
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">Welcome to Nyawit</h2>
                <p className="text-zinc-500">Sweep dust tokens into yield — powered by YO Protocol & Morpho on Base.</p>
              </div>
            </div>
          </div>
        ) : (
          /* Connected — sidebar + content */
          <div className="flex-1 flex max-w-7xl mx-auto w-full px-6 py-6 gap-6">

            {/* ── Sidebar ── */}
            <aside className="w-56 shrink-0">
              <div className="sticky top-24 space-y-1">
                {/* App tagline */}
                <div className="px-3 py-2 mb-4">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Navigation</p>
                </div>

                {NAV_ITEMS.map(({ tab, label, Icon, color, activeColor, activeBg }) => {
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      id={`tour-desktop-${tab}`}
                      onClick={() => setActiveTab(tab)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? `${activeBg} ${activeColor}`
                          : `${color} hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-300`
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                      {label}
                    </button>
                  );
                })}

                {/* Divider + info */}
                <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 px-3 space-y-3">
                  <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Powered by</div>
                  <div className="space-y-2">
                    <a href="https://yo.xyz" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-zinc-500 hover:text-yellow-600 transition-colors">
                      <span className="text-base">🐷</span> YO Protocol
                    </a>
                    <a href="https://morpho.org" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-zinc-500 hover:text-blue-600 transition-colors">
                      <span className="text-base">🟣</span> Morpho Blue
                    </a>
                    <a href="https://li.fi" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-zinc-500 hover:text-green-600 transition-colors">
                      <span className="text-base">🦎</span> LI.FI
                    </a>
                    <a href="https://base.org" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-zinc-500 hover:text-blue-500 transition-colors">
                      <span className="text-base">🔵</span> Base
                    </a>
                  </div>
                </div>
              </div>
            </aside>

            {/* ── Main content ── */}
            <main className="flex-1 min-w-0">
              {/* Tab header */}
              <div className="mb-6">
                <h2 className={`text-3xl font-bold ${header.titleClass}`}>{header.title}</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{header.subtitle}</p>
              </div>

              {/* Tab content — desktop gets wider + optionally 2-col */}
              <div className={activeTab === "tanam" ? "desktop-earn-grid" : ""}>
                {activeTab === "deposit" && (
                  <div className="max-w-2xl">
                    <DustDepositView />
                  </div>
                )}
                {activeTab === "swap" && (
                  <div className="max-w-2xl">
                    <SwapView onTabChange={setActiveTab} />
                  </div>
                )}
                {activeTab === "tanam" && <TanamView />}
                {activeTab === "vault" && (
                  <div className="max-w-2xl">
                    <VaultView />
                  </div>
                )}
              </div>
            </main>

          </div>
        )}
      </div>

    </div>
  );
}
