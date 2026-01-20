import { Network, Alchemy } from "alchemy-sdk";

// Kita ambil langsung dari process.env
// Saat deploy di Vercel, nilai ini akan otomatis diisi oleh server Vercel
const settings = {
  apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY, 
  network: Network.BASE_MAINNET,
};

export const alchemy = new Alchemy(settings);