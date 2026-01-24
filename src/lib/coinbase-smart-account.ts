import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain } from "viem";
import { baseSepolia } from "viem/chains"; 
import { toCoinbaseSmartAccount } from "viem/account-abstraction";
import { toAccount } from "viem/accounts"; 

const ENTRYPOINT_ADDRESS_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

/* =======================
   1. PUBLIC CLIENT
======================= */
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"), 
});

/* =======================
   2. PIMLICO CLIENT (PAYMASTER)
======================= */
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
const PIMLICO_URL = `https://api.pimlico.io/v2/84532/rpc?apikey=${pimlicoApiKey}`;

export const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_URL),
  entryPoint: {
    address: ENTRYPOINT_ADDRESS_V06,
    version: "0.6",
  },
});

/* =======================
   3. COINBASE SMART ACCOUNT (DRIVER)
======================= */
export const getCoinbaseSmartAccountClient = async (walletClient: WalletClient) => {
  if (!walletClient.account) throw new Error("Wallet not detected");

  // 🔥 CUSTOM ADAPTER: FORCE EIP-712
  // Kita buat wrapper 'owner' yang memaksa library menggunakan signTypedData.
  const owner = toAccount({
    address: walletClient.account.address,
    
    // Fallback Sign Message (Jarang dipanggil kalau setup benar)
    async signMessage({ message }) {
      console.log("⚠️ Warning: Library requesting Raw Sign...");
      return walletClient.signMessage({ message, account: walletClient.account! });
    },

    // INI YANG WAJIB DIPANGGIL OLEH USER OP
    async signTypedData(parameters) {
      console.log("✍️ Signing EIP-712 Typed Data...");
      
      // Kita spread parameter dengan casting 'any' agar TypeScript tidak rewel
      // tapi data runtime tetap valid dikirim ke Coinbase Wallet.
      return walletClient.signTypedData({ 
        account: walletClient.account!,
        ...(parameters as any)
      });
    },

    async signTransaction(tx) {
        // @ts-ignore
        return walletClient.signTransaction({ ...tx, account: walletClient.account! });
    }
  });

  console.log("🔍 [CSW] Initializing Smart Account...");

  // Setup Account Object
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [owner], 
    nonce: 0n, // Deterministik
    version: "1.1" // Versi terbaru
  });

  console.log("✅ [CSW] Address:", coinbaseAccount.address);

  // Setup Permissionless Client
  return createSmartAccountClient({
    account: coinbaseAccount,
    chain: baseSepolia,
    bundlerTransport: http(PIMLICO_URL),
    
    // 🔥 AKTIFKAN PAYMASTER AGAR GAS GRATIS / DIBAYAR VAULT
    paymaster: pimlicoClient, 
    
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }) as any as SmartAccountClient<Transport, Chain, typeof coinbaseAccount>;
};