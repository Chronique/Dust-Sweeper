import { type WalletClient, type Hex } from "viem";
import { toAccount } from "viem/accounts";

/**
 * HYBRID SIGNER (FIXED)
 * Memaksa Viem mengenali ini sebagai Local Account agar tidak error raw sign.
 */
export const getHybridSigner = (walletClient: WalletClient) => {
  if (!walletClient.account) {
    throw new Error("Hybrid Signer Error: Wallet tidak terdeteksi (No Account)");
  }

  const address = walletClient.account.address;

  // Kita gunakan toAccount dari Viem untuk membuat custom wrapper
  return toAccount({
    address: address,

    // 🔥🔥🔥 BAGIAN INI WAJIB ADA (JANGAN DIHAPUS) 🔥🔥🔥
    // Ini memberi tahu Viem: "Ini akun lokal, jangan minta raw sign ke wallet asli!"
    type: "local",    
    source: "custom", 
    // --------------------------------------------------------

    // 1. SIGN MESSAGE (Wajib untuk UserOp - Smart Account pakai ini)
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
    // Fungsi ini membuat Viem "puas" bahwa akun ini bisa sign transaction,
    // meskipun sebenarnya kita tidak pernah mengirim raw transaction dari sini.
    async signTransaction(transaction) {
      // Signature dummy agar lolos validasi
      return "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" as Hex;
    },
  });
};