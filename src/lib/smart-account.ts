import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
// 🔥 PERBAIKAN 1: Tambahkan 'toHex' di import
import { createPublicClient, http, type WalletClient, type Transport, type Chain, type Account, toHex } from "viem";
import { createPaymasterClient } from "viem/account-abstraction";
import { base } from "viem/chains";
import { entryPoint06Address } from "viem/account-abstraction";

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

  // 4. Setup Safe Smart Account
  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [walletClient as WalletClient<Transport, Chain, Account>],
    entryPoint: {
      address: ENTRYPOINT_ADDRESS_V06,
      version: "0.6",
    },
    version: "1.4.1", 
  });

  // 🔥 PERBAIKAN 2: Gunakan (safeAccount as any) untuk membungkam error TypeScript
  // Ini tetap aman dilakukan karena di runtime Javascript properti ini bisa di-overwrite
  (safeAccount as any).getDummySignature = async () => {
    return toHex(new Uint8Array(1000).fill(1)) as `0x${string}`;
  };

  // 5. Setup Smart Account Client
  return createSmartAccountClient({
    account: safeAccount,
    chain: base,
    bundlerTransport: http(PIMLICO_URL),
    
    // Auto Sponsor ke Coinbase
    paymaster: coinbasePaymasterClient,

    userOperation: {
      estimateFeesPerGas: async () => {
        // Tetap pakai Pimlico untuk estimasi gas
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }) as any as SmartAccountClient<Transport, Chain, typeof safeAccount>;
};