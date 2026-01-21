"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export const useProductTour = () => {
  
  const runTour = () => {
    const driverObj = driver({
      showProgress: true, // Menampilkan "1 of 4"
      animate: true,
      // Langkah-langkah Tour
      steps: [
        { 
          element: '#tour-logo', 
          popover: { 
            title: 'Welcome to Nyawit! 👋', 
            description: 'An application for converting dust tokens into valuable assets.' 
          } 
        },
        { 
          element: '#tour-connect-wallet', 
          popover: { 
            title: 'Wallet Connection', 
            description: 'Connect your EVM or Farcaster wallet here to get started.' 
          } 
        },
        { 
          element: '#tour-nav-deposit', 
          popover: { 
            title: '1. Blusukan (Deposit)', 
            description: 'Scan your wallet to find small tokens, then send them to Smart Vault..',
            side: "top" // Muncul di atas tombol
          } 
        },
        { 
          element: '#tour-nav-swap', 
          popover: { 
            title: '2. Bakar Wilayah (Swap)', 
            description: 'Swap all collected dust tokens into ETH or USDC at once.',
            side: "top"
          } 
        },
        { 
          element: '#tour-nav-vault', 
          popover: { 
            title: '3. Panen (Vault)', 
            description: 'View your harvest (balance) in your Smart Account and withdraw to your main wallet.',
            side: "top"
          } 
        }
      ],
      // Setelah tour selesai, simpan status agar tidak muncul lagi
      onDestroyStarted: () => {
        localStorage.setItem("nyawit-tour-completed", "true");
        driverObj.destroy();
      },
    });

    driverObj.drive();
  };

  // Cek apakah user sudah pernah lihat tour?
  useEffect(() => {
    // Kasih timeout dikit biar UI loading selesai dulu
    const timer = setTimeout(() => {
      const isTourCompleted = localStorage.getItem("nyawit-tour-completed");
      if (!isTourCompleted) {
        runTour();
      }
    }, 1500); // Muncul 1.5 detik setelah buka web

    return () => clearTimeout(timer);
  }, []);

  // Return function runTour supaya bisa dipanggil manual (misal dari tombol Bantuan)
  return { runTour };
};