// src/lib/hybrid-signer.ts
import { type WalletClient, type Hex } from "viem";
import { toAccount } from "viem/accounts";

/**
 * HYBRID SIGNER (FINAL VERSION)
 * Menjembatani Wallet Asli (EOA) dengan Smart Account (Permissionless).
 * Menggunakan type: "local" untuk memuaskan validasi Viem.
 */
export const getHybridSigner = (walletClient: WalletClient) => {
  if (!walletClient.account) {
    throw new Error("Hybrid Signer Error: Wallet tidak terdeteksi (No Account)");
  }

  const address = walletClient.account.address;

  return toAccount({
    address: address,

    // 🔥🔥🔥 BAGIAN WAJIB (JANGAN DIHAPUS) 🔥🔥🔥
    // Ini kuncinya! Tanpa ini, Viem mengira ini akun remote & minta raw sign.
    type: "local",    
    source: "custom", 
    // ----------------------------------------------

    // 1. SIGN MESSAGE (Dipakai untuk UserOperation)
    async signMessage({ message }) {
      return walletClient.signMessage({ 
        message, 
        account: address 
      });
    },

    // 2. SIGN TYPED DATA (Dipakai untuk protokol tertentu)
    async signTypedData(typedData) {
      return walletClient.signTypedData({ 
        ...typedData, 
        account: address 
      } as any);
    },

    // 3. SIGN TRANSACTION (Dummy)
    // Fungsi ini membuat Viem "puas" dan tidak error, 
    // meskipun Smart Account tidak akan pernah memanggilnya.
    async signTransaction(transaction) {
      return "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" as Hex;
    },
  });
};