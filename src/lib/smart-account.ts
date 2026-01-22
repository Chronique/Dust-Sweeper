import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain } from "viem";
import { entryPoint06Address, toCoinbaseSmartAccount } from "viem/account-abstraction";
import { baseSepolia } from "viem/chains"; 
import { toAccount } from "viem/accounts"; // 🔥 Helper Resmi

const ENTRYPOINT_ADDRESS_V06 = entryPoint06Address;

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;

if (!alchemyApiKey) throw new Error("Alchemy API Key missing!");
if (!pimlicoApiKey) throw new Error("Pimlico API Key missing!");

// 1. Public Client (Base Sepolia)
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(`https://base-sepolia.g.alchemy.com/v2/${alchemyApiKey}`),
});

// 2. Pimlico Client (Bundler - Base Sepolia)
const PIMLICO_URL = `https://api.pimlico.io/v2/84532/rpc?apikey=${pimlicoApiKey}`;

export const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_URL),
  entryPoint: {
    address: ENTRYPOINT_ADDRESS_V06,
    version: "0.6",
  },
});

export const getSmartAccountClient = async (walletClient: WalletClient) => {
  if (!walletClient.account) throw new Error("Wallet tidak terdeteksi");

  // 🔥 SOLUSI FINAL: Gunakan 'toAccount' dengan 'as any' di signTypedData
  const customOwner = toAccount({
    address: walletClient.account.address,
    
    // Delegasi Sign Message
    async signMessage({ message }) {
      return walletClient.signMessage({ message, account: walletClient.account! });
    },
    
    // 🔥 FIX: Tambahkan 'as any' di sini untuk membungkam error Generics
    async signTypedData(params) {
      return walletClient.signTypedData({ 
        ...params, 
        account: walletClient.account! 
      } as any);
    },
    
    // Stub Transaction (Biar gak error Raw Sign)
    async signTransaction(transaction) {
      throw new Error("Smart Account Owner cannot sign raw transactions.");
    },
  });

  // 4. Setup Coinbase Smart Account
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [customOwner],
    version: "1.1", 
  });

  // 5. Setup Smart Account Client (Manual Gas)
  return createSmartAccountClient({
    account: coinbaseAccount,
    chain: baseSepolia,
    bundlerTransport: http(PIMLICO_URL),
    
    // User bayar gas sendiri (Self Pay)
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }) as any as SmartAccountClient<Transport, Chain, typeof coinbaseAccount>;
};