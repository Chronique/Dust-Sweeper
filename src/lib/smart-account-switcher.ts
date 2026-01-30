import { type WalletClient } from "viem";
// [FIX] Import dari file baru yang sudah distandarisasi
import { getSmartAccountClient } from "./smart-account";

export const getUnifiedSmartAccountClient = async (
  walletClient: WalletClient, 
  connectorId: string | undefined,
  accountIndex: bigint = 0n
) => {
  console.log("🔒 Smart Account: Initializing Unified Vault via Privy...");
  // Langsung panggil fungsi standar kita
  return getSmartAccountClient(walletClient);
};