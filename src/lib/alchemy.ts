import { Network, Alchemy } from "alchemy-sdk";

const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

// Log debug
console.log("DEBUG ALCHEMY KEY:", apiKey ? "Key Found" : "KEY MISSING");

const settings = {
  apiKey: apiKey, 
  network: Network.BASE_SEPOLIA, // 🔥 GANTI KE SEPOLIA
};

export const alchemy = new Alchemy(settings);