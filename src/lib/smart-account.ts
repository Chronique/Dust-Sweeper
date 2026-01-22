// src/lib/smart-account.ts
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient } from "viem";
import { entryPoint06Address, toCoinbaseSmartAccount } from "viem/account-abstraction";
import { baseSepolia } from "viem/chains"; 
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"; // 👈 Tambah ini

const ENTRYPOINT_ADDRESS_V06 = entryPoint06Address;
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
const PUBLIC_RPC_URL = "https://sepolia.base.org";

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(PUBLIC_RPC_URL),
});

export const pimlicoClient = createPimlicoClient({
  transport: http(`https://api.pimlico.io/v2/84532/rpc?apikey=${pimlicoApiKey}`),
  entryPoint: {
    address: ENTRYPOINT_ADDRESS_V06,
    version: "0.6",
  },
});

// 🔥 SOLUSI DARURAT: GENERATE RANDOM KEY
// Jika ini berhasil, berarti masalah 100% ada di file hybrid-signer.ts Anda.
const burnerOwner = privateKeyToAccount(generatePrivateKey()); 

export const getSmartAccountClient = async (walletClient: WalletClient) => {
  // Kita abaikan walletClient (MetaMask) sebentar, pakai Burner Account
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [burnerOwner], // 👈 Pakai Burner Owner (Pasti Support Raw Sign)
    version: "1.1", 
  });

  return createSmartAccountClient({
    account: coinbaseAccount,
    chain: baseSepolia,
    bundlerTransport: http(`https://api.pimlico.io/v2/84532/rpc?apikey=${pimlicoApiKey}`),
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  });
};