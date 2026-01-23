import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain, type Hex, type LocalAccount, toHex } from "viem";
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
 * 🔥 FINAL BOSS SIGNER: Direct RPC Implementation
 * Ini mem-bypass semua validasi Viem dan langsung tembak browser.
 */
const getDirectRpcSigner = (walletClient: WalletClient): LocalAccount => {
  if (!walletClient.account) throw new Error("Wallet not connected");
  const userAddress = walletClient.account.address;

  // Kita akses 'transport' untuk bisa request manual
  const provider = walletClient.transport as any;

  return toAccount({
    address: userAddress,
    type: "local",
    source: "custom",

    // 1. SIGN MESSAGE (Digunakan untuk UserOp)
    async signMessage({ message }) {
      console.log("✍️ [Direct RPC] Signing Message...");
      
      // A. Pastikan message dalam format Hex String
      let msgHex: string;
      if (typeof message === 'string') {
          msgHex = toHex(message); // Convert string biasa ke hex
      } else if (typeof message === 'object' && 'raw' in message) {
          msgHex = message.raw as string;
      } else {
          msgHex = toHex(message as any); // Bytes/Uint8Array ke hex
      }

      console.log("📦 Payload:", msgHex);

      try {
        // B. Tembak langsung ke Provider (Bypass Viem High Level)
        const signature = await provider.request({
            method: 'personal_sign',
            params: [msgHex, userAddress]
        });

        console.log("✅ Signature:", signature);
        return signature;

      } catch (err: any) {
        console.error("❌ Sign Error:", err);
        // Fallback: Kadang Coinbase minta message string biasa (bukan hex)
        if (typeof message === 'string') {
             console.log("🔄 Retrying with plain string...");
             return await provider.request({
                method: 'personal_sign',
                params: [message, userAddress]
            });
        }
        throw err;
      }
    },
    
    // 2. SIGN TYPED DATA (Digunakan untuk permit/eip712)
    async signTypedData(typedData) {
      console.log("✍️ [Direct RPC] Signing Typed Data...");
      
      // Kita stringify data karena eth_signTypedData_v4 butuh JSON String
      const dataStr = JSON.stringify(typedData);
      
      return await provider.request({
        method: 'eth_signTypedData_v4',
        params: [userAddress, dataStr]
      });
    },

    // 3. DUMMY SIGN TRANSACTION
    async signTransaction(_) {
      return "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" as Hex;
    }
  });
};

// 3. COINBASE SMART ACCOUNT CLIENT
export const getCoinbaseSmartAccountClient = async (walletClient: WalletClient) => {
  if (!walletClient.account) throw new Error("Wallet tidak terdeteksi");

  // A. Gunakan Direct RPC Signer
  const owner = getDirectRpcSigner(walletClient);
  
  console.log("🔍 [Vault] Signer Ready:", owner.address);

  // B. Setup Coinbase Account (Sub-Account)
  // Nonce: 0n menjaga agar address tetap sama dengan deployment
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [owner], 
    version: "1.1", 
    nonce: 0n, 
  });

  console.log("🔒 [Vault] Address:", coinbaseAccount.address);

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