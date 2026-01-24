import { type WalletClient } from "viem";
import { getSmartAccountClient as getSimpleClient } from "./simple-smart-account";
import { getCoinbaseSmartAccountClient } from "./coinbase-smart-account";

export const getUnifiedSmartAccountClient = async (
  walletClient: WalletClient, 
  connectorId?: string,
  accountIndex: bigint = 0n 
) => {
  // 1. Debugging Info
  console.log("🔍 [Switcher] Connector ID:", connectorId);
  
  // 2. DETEKSI SUPER AGRESIF
  // Cek ID Connector standar
  const isCoinbaseID = connectorId === "coinbaseWalletSDK" || connectorId === "coinbaseWallet" || connectorId === "coinbase";
  
  // Cek Properti Provider (Paling Akurat)
  // @ts-ignore
  const provider = walletClient.transport?.provider;
  // @ts-ignore
  const isCoinbaseProvider = provider?.isCoinbaseWallet === true || provider?.isCoinbaseBrowser === true;

  // Cek Nama Wallet (Wagmi sering kasih nama 'Coinbase Wallet')
  // @ts-ignore
  const isCoinbaseName = walletClient.account?.name?.toLowerCase().includes("coinbase");

  const isCoinbase = isCoinbaseID || isCoinbaseProvider || isCoinbaseName;

  console.log("👉 Is Coinbase Detected?", isCoinbase);

  // 3. LOGIKA PEMILIHAN
  if (isCoinbase) {
    console.log("✅ MODE: Coinbase Smart Wallet (EIP-712)");
    return await getCoinbaseSmartAccountClient(walletClient);
  } 
  
  else {
    console.log("✅ MODE: Standard EOA (Simple Account)");
    return await getSimpleClient(walletClient, accountIndex);
  }
};