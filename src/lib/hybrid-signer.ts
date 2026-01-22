// src/lib/hybrid-signer.ts
import { type WalletClient, type Hex } from "viem";
import { toAccount } from "viem/accounts";

/**
 * HYBRID SIGNER
 * Tugas: Mengubah WalletClient (MetaMask/EOA) menjadi 'LocalAccount' yang valid
 * untuk permissionless.js tanpa memicu error "owner does not support raw sign".
 */
export const getHybridSigner = (walletClient: WalletClient) => {
  if (!walletClient.account) {
    throw new Error("Hybrid Signer Error: Wallet tidak terdeteksi (No Account)");
  }

  const address = walletClient.account.address;

  // Kita gunakan toAccount dari Viem untuk membuat custom wrapper
  return toAccount({
    address: address,

    // 1. SIGN MESSAGE (Wajib untuk UserOp)
    // Ini akan memanggil popup sign di wallet asli user (MetaMask/Farcaster)
    async signMessage({ message }) {
      return walletClient.signMessage({ 
        message, 
        account: address 
      });
    },

    // 2. SIGN TYPED DATA (Wajib untuk protokol tertentu)
    async signTypedData(typedData) {
      return walletClient.signTypedData({ 
        ...typedData, 
        account: address 
      } as any);
    },

    // 3. SIGN TRANSACTION (DUMMY / BYPASS)
    // Masalah "Raw Sign" diselesaikan di sini.
    // Viem mewajibkan fungsi ini ada, tapi Smart Account TIDAK PERNAH memakainya.
    // Kita return signature "kosong" (65 bytes zero signature) agar validasi lolos.
    async signTransaction(transaction) {
      // Return 65-byte dummy signature (format r,s,v valid tapi isinya nol)
      return "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" as Hex;
    },
  });
};