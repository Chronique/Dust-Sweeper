import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain, type Account } from "viem";
import { createPaymasterClient, entryPoint06Address, toCoinbaseSmartAccount } from "viem/account-abstraction";
import { base } from "viem/chains";

const ENTRYPOINT_ADDRESS_V06 = entryPoint06Address;

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
const coinbasePaymasterUrl = process.env.NEXT_PUBLIC_COINBASE_PAYMASTER_URL;

if (!alchemyApiKey) throw new Error("Alchemy API Key missing!");
if (!pimlicoApiKey) throw new Error("Pimlico API Key missing!");
if (!coinbasePaymasterUrl) throw new Error("Coinbase Paymaster URL missing!");

// 1. Public Client
export const publicClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`),
});

// 2. Pimlico Client (Bundler)
const PIMLICO_URL = `https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`;
export const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_URL),
  entryPoint: {
    address: ENTRYPOINT_ADDRESS_V06,
    version: "0.6",
  },
});

// 3. Coinbase Paymaster Client
const coinbasePaymasterClient = createPaymasterClient({
  transport: http(coinbasePaymasterUrl),
});

export const getSmartAccountClient = async (walletClient: WalletClient) => {
  if (!walletClient.account) throw new Error("Wallet tidak terdeteksi");

  // Custom Owner Wrapper (Bungkam Error TS Strict)
  const customOwner = {
    address: walletClient.account.address,
    async signMessage({ message }: { message: any }) {
      return walletClient.signMessage({ message, account: walletClient.account! });
    },
    async signTypedData(params: any) {
      return walletClient.signTypedData({ ...params, account: walletClient.account! });
    },
    async signTransaction(params: any) {
      return walletClient.signTransaction({ ...params, chain: base, account: walletClient.account! });
    },
    type: "local", 
    source: "custom",
    publicKey: walletClient.account.address
  } as any; 

  // 4. Setup Coinbase Smart Account (Native dari Viem)
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [customOwner],
    // 🔥 FIX: Tambahkan version "1.1" (Wajib di Viem terbaru)
    version: "1.1", 
  });

  // 5. Setup Smart Account Client
  return createSmartAccountClient({
    account: coinbaseAccount,
    chain: base,
    bundlerTransport: http(PIMLICO_URL),
    
    // Auto Sponsor ke Coinbase Paymaster
    paymaster: coinbasePaymasterClient,

    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }) as any as SmartAccountClient<Transport, Chain, typeof coinbaseAccount>;
};