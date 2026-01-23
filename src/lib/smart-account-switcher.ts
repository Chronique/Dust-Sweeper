import { type WalletClient } from "viem";
import { getSmartAccountClient as getSimpleClient } from "./simple-smart-account";
import { getCoinbaseSmartAccountClient } from "./coinbase-smart-account";

/**
 * SMART WALLET SWITCHER (ROBUST VERSION)
 * Otomatis memilih jenis Smart Account berdasarkan Wallet asli user.
 */
export const getUnifiedSmartAccountClient = async (
  walletClient: WalletClient, 
  connectorId?: string
) => {
  // 1. Log untuk Debugging (Cek Console Browser Anda)
  console.log("🔍 [Switcher] Checking Wallet Type...");
  console.log("👉 Connector ID:", connectorId);
  
  // 2. DETEKSI AGRESIF
  // Cek ID Connector (Standar Wagmi)
  const isCoinbaseID = connectorId === "coinbaseWalletSDK" || connectorId === "coinbaseWallet";
  
  // Cek Internal Provider (Jaga-jaga kalau ID-nya beda, misal 'injected')
  // @ts-ignore
  const isCoinbaseProvider = walletClient.transport?.provider?.isCoinbaseWallet === true;

  const isCoinbase = isCoinbaseID || isCoinbaseProvider;

  console.log("👉 Is Coinbase Detected?", isCoinbase);

  // 3. LOGIKA PEMILIHAN
  if (isCoinbase) {
    console.log("✅ MODE: Coinbase Smart Wallet (Sub-Account)");
    // Gunakan mesin khusus Coinbase yang sudah kita pasangi "Wrapper Anti-Raw Sign"
    return await getCoinbaseSmartAccountClient(walletClient);
  } 
  
  else {
    console.log("✅ MODE: Standard EOA (Simple Account)");
    // Default untuk MetaMask, TrustWallet, dll
    return await getSimpleClient(walletClient);
  }
};