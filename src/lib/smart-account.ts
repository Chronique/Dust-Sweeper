import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain, type Account } from "viem";
import { entryPoint06Address, toCoinbaseSmartAccount } from "viem/account-abstraction";
import { baseSepolia } from "viem/chains"; // 🔥 Pastikan ini baseSepolia

const ENTRYPOINT_ADDRESS_V06 = entryPoint06Address;

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;

if (!alchemyApiKey) throw new Error("Alchemy API Key missing!");
if (!pimlicoApiKey) throw new Error("Pimlico API Key missing!");

// 1. Public Client (Base Sepolia)
export const publicClient = createPublicClient({
  chain: baseSepolia,
  // 🔥 Pastikan URL ini base-sepolia
  transport: http(`https://base-sepolia.g.alchemy.com/v2/${alchemyApiKey}`),
});

// 2. Pimlico Client (Bundler - Base Sepolia Chain ID 84532)
// 🔥 Pastikan Chain ID ini 84532
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

  // Custom Owner Wrapper (MetaMask EOA)
  const customOwner = {
    address: walletClient.account.address,
    async signMessage({ message }: { message: any }) {
      return walletClient.signMessage({ message, account: walletClient.account! });
    },
    async signTypedData(params: any) {
      return walletClient.signTypedData({ ...params, account: walletClient.account! });
    },
    type: "json-rpc", 
    source: "custom",
    publicKey: walletClient.account.address
  } as any; 

  // Setup Coinbase Smart Account (v1.1)
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [customOwner],
    version: "1.1", 
  });

  // Setup Client (Tanpa Paymaster / Manual Gas)
  return createSmartAccountClient({
    account: coinbaseAccount,
    chain: baseSepolia,
    bundlerTransport: http(PIMLICO_URL),
    
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }) as any as SmartAccountClient<Transport, Chain, typeof coinbaseAccount>;
};