"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export const useProductTour = () => {

  const runTour = () => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      steps: [
        {
          element: '#tour-logo',
          popover: {
            title: 'Welcome to Nyawit 👋',
            description: 'Turn idle dust tokens into productive yield — powered by YO Protocol & Morpho on Base.',
          }
        },
        {
          element: '#tour-connect-wallet',
          popover: {
            title: 'Connect Your Wallet',
            description: 'Connect via Base App, Coinbase Smart Wallet, Rabby, or MetaMask to access your Smart Vault.',
          }
        },
        {
          element: '#tour-nav-deposit',
          popover: {
            title: '1. Scan',
            description: 'Scan your wallet to find dust tokens (small balances), then send them to your Smart Vault.',
            side: "top",
          }
        },
        {
          element: '#tour-nav-swap',
          popover: {
            title: '2. Sweep',
            description: 'Batch swap up to 5 dust tokens into WETH in a single gasless transaction — powered by LI.FI.',
            side: "top",
          }
        },
        {
          element: '#tour-nav-tanam',
          popover: {
            title: '3. Earn',
            description: 'Deposit into YO Protocol (yoUSD) or Morpho Blue to earn yield. Compare live APYs and choose the best rate.',
            side: "top",
          }
        },
        {
          element: '#tour-nav-vault',
          popover: {
            title: '4. Vault',
            description: 'View your full Smart Vault balance and withdraw assets back to your main wallet anytime.',
            side: "top",
          }
        },
      ],
      onDestroyStarted: () => {
        localStorage.setItem("nyawit-tour-completed", "true");
        driverObj.destroy();
      },
    });

    driverObj.drive();
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const isTourCompleted = localStorage.getItem("nyawit-tour-completed");
      if (!isTourCompleted) runTour();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return { runTour };
};
