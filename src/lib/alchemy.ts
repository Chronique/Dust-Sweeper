import { Network, Alchemy } from "alchemy-sdk";

// Mengambil API Key dari Environment Variable (Vercel Dashboard)
const settings = {
  apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY, 
  network: Network.BASE_MAINNET,
};

// Export instance Alchemy
export const alchemy = new Alchemy(settings);