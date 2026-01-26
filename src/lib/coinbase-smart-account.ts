import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { 
  createPublicClient, 
  http, 
  type WalletClient, 
  type Transport, 
  type Chain, 
  type LocalAccount 
} from "viem";
import { baseSepolia } from "viem/chains"; 
import { toCoinbaseSmartAccount } from "viem/account-abstraction";

const ENTRYPOINT_ADDRESS_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
const PIMLICO_URL = `https://api.pimlico.io/v2/84532/rpc?apikey=${pimlicoApiKey}`;

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"), 
});

export const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_URL),
  entryPoint: {
    address: ENTRYPOINT_ADDRESS_V06,
    version: "0.6",
  },
});

export const getCoinbaseSmartAccountClient = async (walletClient: WalletClient) => {
  if (!walletClient.account) throw new Error("Wallet not detected");

  // WRAPPER OWNER: PENJAGA GERBANG
  const bridgeOwner: LocalAccount = {
    address: walletClient.account.address,
    publicKey: walletClient.account.address,
    source: 'custom',
    type: 'local', 

    // A. JALUR RAW (Cadangan)
    signMessage: async ({ message }: { message: any }) => {
       console.log("✍️ [Bridge] Forwarding Raw Sign...");
       return walletClient.signMessage({ 
         message,
         account: walletClient.account! 
       });
    },

    // B. JALUR TYPED DATA (UTAMA) - DENGAN SANITIZER
    signTypedData: async (parameters: any) => {
      console.log("✍️ [Bridge] Forwarding Typed Data (EIP-712)...");
      
      const { domain, types, primaryType, message } = parameters;

      // 1. CEK FATAL ERROR: Types tidak boleh kosong!
      if (!types || Object.keys(types).length === 0) {
          console.error("❌ CRITICAL: 'types' object is missing/empty!", parameters);
          throw new Error("Invalid EIP-712 Request: Missing Types");
      }

      // 2. CEK CHAIN ID
      if (domain && !domain.chainId) {
         domain.chainId = baseSepolia.id; 
      }

      // 3. KIRIM DATA BERSIH (CLONE OBJECT)
      // Ini mencegah error "reading types of null" di wallet extension
      return walletClient.signTypedData({
        account: walletClient.account!,
        domain: { ...domain },           
        types: { ...types },             
        primaryType: primaryType,
        message: { ...message }          
      });
    },

    // C. Stub
    signTransaction: async (tx: any) => {
        throw new Error("Smart Account cannot sign transactions directly. Use UserOp.");
    }
  } as any;

  // SETUP AKUN
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [bridgeOwner], 
    nonce: 0n, 
    version: "1.1" 
  });

  // RETURN CLIENT
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