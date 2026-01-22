// src/lib/smart-account.ts
import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain } from "viem";
import { entryPoint06Address, toCoinbaseSmartAccount } from "viem/account-abstraction";
import { baseSepolia } from "viem/chains"; 

// 🔥 IMPORT SIGNER HYBRID KITA
import { getHybridSigner } from "./hybrid-signer";

const ENTRYPOINT_ADDRESS_V06 = entryPoint06Address;

// 1. Validasi API Key
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
if (!pimlicoApiKey) throw new Error("Pimlico API Key missing! Cek .env.local");

// 2. RPC Public (Anti Error 401)
const PUBLIC_RPC_URL = "https://sepolia.base.org";

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(PUBLIC_RPC_URL),
});

// 3. Setup Pimlico (Bundler)
const PIMLICO_URL = `https://api.pimlico.io/v2/84532/rpc?apikey=${pimlicoApiKey}`;

export const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_URL),
  entryPoint: {
    address: ENTRYPOINT_ADDRESS_V06,
    version: "0.6",
  },
});

export const getSmartAccountClient = async (walletClient: WalletClient) => {
  // A. Panggil Hybrid Signer (EOA -> Smart Account Owner)
  // Ini otomatis membereskan masalah Raw Sign karena logic-nya sudah dipisah.
  const customOwner = getHybridSigner(walletClient);

  // B. Setup Coinbase Smart Account
  // Kita pasang signer hybrid tadi ke sini.
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [customOwner],
    version: "1.1", 
  });

  // C. Setup Smart Account Client (UserOp Executor)
  return createSmartAccountClient({
    account: coinbaseAccount,
    chain: baseSepolia,
    bundlerTransport: http(PIMLICO_URL),
    
    // Manual Gas / Self Pay
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }) as any as SmartAccountClient<Transport, Chain, typeof coinbaseAccount>;
};