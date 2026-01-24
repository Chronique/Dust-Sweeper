import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain } from "viem";
import { baseSepolia } from "viem/chains"; 
import { toCoinbaseSmartAccount } from "viem/account-abstraction";
import { toAccount } from "viem/accounts"; 

const ENTRYPOINT_ADDRESS_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"), 
});

const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
const PIMLICO_URL = `https://api.pimlico.io/v2/84532/rpc?apikey=${pimlicoApiKey}`;

export const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_URL),
  entryPoint: {
    address: ENTRYPOINT_ADDRESS_V06,
    version: "0.6",
  },
});

export const getCoinbaseSmartAccountClient = async (walletClient: WalletClient) => {
  if (!walletClient.account) throw new Error("Wallet not detected");

  // 🔥 CUSTOM ADAPTER: Memaksa EIP-712 (Typed Data)
  // Ini kunci agar Coinbase tidak error "Raw Sign" saat kirim UserOp
  const owner = toAccount({
    address: walletClient.account.address,
    async signMessage({ message }) {
      return walletClient.signMessage({ message, account: walletClient.account! });
    },
    async signTypedData(parameters) {
      // FORCE CASTING 'as any' untuk bypass validasi TypeScript yang rewel
      // Secara runtime, ini valid dan aman.
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

  // Setup Coinbase Account
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [owner], 
    nonce: 0n, 
    version: "1.1" 
  });

  // Setup Permissionless Client (UserOp Executor)
  return createSmartAccountClient({
    account: coinbaseAccount,
    chain: baseSepolia,
    bundlerTransport: http(PIMLICO_URL),
    
    // 🔥 PAYMASTER: Ini yang bikin gas "Gratis" (disponsori) 
    // atau dibayar oleh saldo Vault (tergantung config Pimlico).
    paymaster: pimlicoClient, 
    
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }) as any as SmartAccountClient<Transport, Chain, typeof coinbaseAccount>;
};