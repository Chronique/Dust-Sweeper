import { type WalletClient } from "viem";
import { getSmartAccountClient as getSimpleClient } from "./simple-smart-account";
import { getCoinbaseSmartAccountClient } from "./coinbase-smart-account";

/**
 * Universal Smart Account Switcher
 * Automatically detects wallet type and returns appropriate client
 */
export const getUnifiedSmartAccountClient = async (
  walletClient: WalletClient, 
  connectorId?: string,
  accountIndex: bigint = 0n 
) => {
  if (!walletClient.account) {
    throw new Error("Wallet client must have an account");
  }

  console.log("🔍 [Switcher] Starting detection...");
  console.log("📋 Connector ID:", connectorId);
  console.log("👤 Account Address:", walletClient.account.address);
  
  // Multi-layer detection for Coinbase Wallet
  const isCoinbaseID = 
    connectorId === "coinbaseWalletSDK" || 
    connectorId === "coinbaseWallet" || 
    connectorId === "coinbase";
  
  // Check provider properties
  // @ts-ignore - accessing provider internals
  const provider = walletClient.transport?.provider;
  // @ts-ignore
  const isCoinbaseProvider = 
    provider?.isCoinbaseWallet === true || 
    provider?.isCoinbaseBrowser === true;

  // Check account name
  // @ts-ignore
  const walletName = walletClient.account?.name?.toLowerCase() || "";
  const isCoinbaseName = walletName.includes("coinbase");

  const isCoinbase = isCoinbaseID || isCoinbaseProvider || isCoinbaseName;

  console.log("🔎 Detection Results:", {
    isCoinbaseID,
    isCoinbaseProvider,
    isCoinbaseName,
    finalResult: isCoinbase
  });

  if (isCoinbase) {
    console.log("✅ Using Coinbase Smart Wallet (EIP-712 Signing)");
    return await getCoinbaseSmartAccountClient(walletClient);
  } else {
    console.log("✅ Using Simple Account (EOA)");
    return await getSimpleClient(walletClient, accountIndex);
  }
};