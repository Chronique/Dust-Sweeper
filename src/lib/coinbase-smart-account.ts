import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http, type WalletClient, type Transport, type Chain, type LocalAccount, type Address } from "viem";
import { baseSepolia } from "viem/chains"; 
import { toCoinbaseSmartAccount } from "viem/account-abstraction";

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

  // 1. Definisikan Owner sebagai LocalAccount MURNI
  // Kita bypass semua deteksi otomatis Viem
  const customOwner: LocalAccount = {
    address: walletClient.account.address,
    publicKey: walletClient.account.address,
    source: 'custom',
    type: 'local', // 👈 KUNCI: Paksa jadi local agar logic kita jalan

    // ⛔ BLOKIR TOTAL RAW SIGN
    signMessage: async ({ message }: { message: any }) => {
       console.error("⛔ BLOCKED: Library tried to Raw Sign!");
       throw new Error("Smart Wallets cannot Raw Sign. Logic Error.");
    },

    // ⛔ BLOKIR SIGN TRANSACTION BIASA
    signTransaction: async (tx: any) => {
       console.error("⛔ BLOCKED: Library tried to Sign Transaction directly!");
       throw new Error("Smart Wallets cannot Sign Transaction directly.");
    },

    // ✅ PAKSA LEWAT SINI (EIP-712)
    signTypedData: async (parameters: any) => {
      console.log("✅ SUCCESS: Intercepted Sign Request -> Forwarding to Wallet as EIP-712");
      
      const params = parameters;
      
      // Inject ChainID Base Sepolia jika kosong
      if (params.domain && !params.domain.chainId) {
         params.domain.chainId = baseSepolia.id; 
      }

      // Panggil Wallet Asli (Extension) dengan format yang benar
      return walletClient.signTypedData({
        account: walletClient.account!,
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message
      });
    }
  } as any;

  console.log("🔍 [CSW] Creating Account with Custom Owner...");

  // 2. Buat Coinbase Account
  const coinbaseAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [customOwner], // Masukkan owner modifikasi kita
    nonce: 0n, 
    version: "1.1" 
  });

  // 3. MONKEY PATCH (Jaga-jaga)
  // Kita timpa lagi fungsi sign di hasil akhir smart account biar yakin 100%
  // @ts-ignore
  coinbaseAccount.signMessage = customOwner.signMessage;
  // @ts-ignore
  coinbaseAccount.signTypedData = customOwner.signTypedData;

  console.log("✅ [CSW] Account Created:", coinbaseAccount.address);

  // 4. Return Client
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