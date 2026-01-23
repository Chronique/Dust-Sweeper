import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain, type Hex, type LocalAccount } from "viem";
import { baseSepolia } from "viem/chains"; 
import { toCoinbaseSmartAccount, entryPoint06Address } from "viem/account-abstraction";
import { toAccount } from "viem/accounts"; 

const ENTRYPOINT_ADDRESS_V06 = entryPoint06Address;

// 1. PUBLIC CLIENT
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});

// 2. PIMLICO CLIENT
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
if (!pimlicoApiKey) throw new Error("❌ API Key Pimlico hilang!");

const PIMLICO_URL = `https://api.pimlico.io/v2/84532/rpc?apikey=${pimlicoApiKey}`;

export const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_URL),
  entryPoint: {
    address: ENTRYPOINT_ADDRESS_V06,
    version: "0.6",
  },
});

/**
 * 🔥 BASE APP FIX: SMART WALLET WRAPPER
 * Base App (Coinbase Wallet) tidak bisa Raw Sign.
 * Wrapper ini memaksa Viem menggunakan 'signMessage' tapi tetap lolos validasi tipe 'LocalAccount'.
 */
const getBaseAppSigner = (walletClient: WalletClient): LocalAccount => {
  if (!walletClient.account) throw new Error("Wallet not connected");
  
  const address = walletClient.account.address;

  // Kita buat Custom Account yang "Berbohong" punya fitur signTransaction
  return toAccount({
    address: address,
    
    // 👇 Mengaku sebagai Local Account
    type: "local",      
    source: "custom", 

    // 1. SIGN MESSAGE (Ini yang ASLI dipakai Smart Wallet untuk otorisasi)
    async signMessage({ message }) {
      console.log("✍️ [BaseApp Wrapper] Signing Message (EIP-191/1271)...");
      return walletClient.signMessage({ message, account: address });
    },

    // 2. SIGN TYPED DATA (Dipakai jika protokol butuh EIP-712)
    async signTypedData(typedData) {
      console.log("✍️ [BaseApp Wrapper] Signing Typed Data...");
      return walletClient.signTypedData({ ...typedData, account: address } as any);
    },

    // 3. SIGN TRANSACTION (DUMMY / PALSU)
    // 👇 Fungsi ini WAJIB ADA agar tidak error "does not support raw sign".
    // Kita return string Hex sembarang karena Base App TIDAK AKAN PERNAH memanggil ini untuk UserOp.
    async signTransaction(transaction) {
      console.warn("⚠️ [BaseApp Wrapper] Bypass: Dummy signTransaction dipanggil.");
      return "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" as Hex;
    },
  }) as LocalAccount;
};

// 3. COINBASE SMART ACCOUNT CLIENT
export const getCoinbaseSmartAccountClient = async (walletClient: WalletClient) => {
  if (!walletClient.account) throw new Error("Wallet tidak terdeteksi");

  // A. GUNAKAN WRAPPER KHUSUS BASE APP
  const smartWalletSigner = getBaseAppSigner(walletClient);
  
  console.log("🔍 Using BaseApp Signer Wrapper:", smartWalletSigner.type); 

  // B. Setup Coinbase Account
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [smartWalletSigner], // 👈 Masukkan signer palsu
    version: "1.1", 
  });

  // C. Setup Executor
  return createSmartAccountClient({
    account: coinbaseAccount,
    chain: baseSepolia,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: pimlicoClient, 
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }) as any as SmartAccountClient<Transport, Chain, typeof coinbaseAccount>;
};