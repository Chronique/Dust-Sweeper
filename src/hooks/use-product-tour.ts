"use client";

import { useEffect, useRef } from "react";
import { driver, type Config } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_KEY = "nyawit-tour-completed";

const isDesktop = () => typeof window !== "undefined" && window.innerWidth >= 768;

function buildSteps() {
  const desktop = isDesktop();

  const welcome = {
    element: "#tour-logo",
    popover: {
      title: "Welcome to Nyawit 👋",
      description: "Turn idle dust tokens into productive yield — powered by YO Protocol & Morpho on Base.",
      side: "bottom" as const,
      align: "start" as const,
    },
  };

  if (desktop) {
    return [
      welcome,
      {
        element: "#tour-desktop-deposit",
        popover: { title: "1. Blusukan", description: "Scan dompet kamu, temukan dust token, lalu kirim ke Smart Vault.", side: "right" as const, align: "center" as const },
      },
      {
        element: "#tour-desktop-swap",
        popover: { title: "2. Bakar Wilayah", description: "Bakar hingga 5 dust token jadi WETH sekaligus — satu transaksi via LI.FI.", side: "right" as const, align: "center" as const },
      },
      {
        element: "#tour-desktop-tanam",
        popover: { title: "3. Tanam", description: "Simpan ke YO Protocol (yoUSD/yoETH/yoBTC/yoEUR) atau Morpho Blue — bandingkan APY langsung.", side: "right" as const, align: "center" as const },
      },
      {
        element: "#tour-desktop-vault",
        popover: { title: "4. Panen", description: "Lihat semua posisi & saldo Smart Vault kamu. Tarik kapan saja.", side: "right" as const, align: "center" as const },
      },
    ];
  }

  return [
    welcome,
    {
      element: "#tour-nav-deposit",
      popover: { title: "1. Blusukan", description: "Scan dompet kamu, temukan dust token, lalu kirim ke Smart Vault.", side: "top" as const, align: "center" as const },
    },
    {
      element: "#tour-nav-swap",
      popover: { title: "2. Bakar Wilayah", description: "Bakar hingga 5 dust token jadi WETH sekaligus — satu transaksi via LI.FI.", side: "top" as const, align: "center" as const },
    },
    {
      element: "#tour-nav-tanam",
      popover: { title: "3. Tanam", description: "Simpan ke YO Protocol atau Morpho Blue — bandingkan APY langsung.", side: "top" as const, align: "center" as const },
    },
    {
      element: "#tour-nav-vault",
      popover: { title: "4. Panen", description: "Lihat semua posisi & saldo Smart Vault kamu. Tarik kapan saja.", side: "top" as const, align: "center" as const },
    },
  ];
}

export const useProductTour = (isConnected: boolean) => {
  const hasRun = useRef(false);

  const runTour = () => {
    const config: Config = {
      showProgress: true,
      animate: true,
      overlayOpacity: 0.5,
      stagePadding: 6,
      steps: buildSteps(),
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_KEY, "true");
        driverObj.destroy();
      },
    };
    const driverObj = driver(config);
    driverObj.drive();
  };

  // Only auto-run after wallet is connected + tour not done yet
  useEffect(() => {
    if (!isConnected) return;
    if (hasRun.current) return;
    if (localStorage.getItem(TOUR_KEY)) return;

    hasRun.current = true;
    const timer = setTimeout(runTour, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  return { runTour };
};
