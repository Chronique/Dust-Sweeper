"use client";

import { useEffect, useState, useCallback } from "react";
import { useWalletClient, useAccount, useSwitchChain } from "wagmi";
import {
  getSmartAccountClient,
  getDirectVaultClient,
  publicClient,
  detectVaultAddress,
} from "~/lib/smart-account";
import { formatUnits, encodeFunctionData, erc20Abi, type Address } from "viem";
import { base } from "viem/chains";
import { Sprout, RefreshCw, ArrowRight, TrendingUp, Wallet, Zap, ArrowUpDown } from "lucide-react";
import { SimpleToast } from "~/components/ui/simple-toast";
import { fetchMoralisTokens } from "~/lib/moralis-data";
import { useAppDialog } from "~/components/ui/app-dialog";
import { createYoClient } from "@yo-protocol/core";
import { sdk } from "@farcaster/miniapp-sdk";

// ── Constants ─────────────────────────────────────────────────────────────────
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;
const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as Address;
const ETH_NATIVE   = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const LIFI_API_URL = "https://li.quest/v1";
const LIFI_API_KEY = process.env.NEXT_PUBLIC_LIFI_API_KEY || "";
const GAS_RESERVE  = 10000000000000n; // 0.00001 ETH

// YO Protocol — yoUSD vault on Base
const YO_USD_VAULT  = "0x0000000f2eb9f69274678c76222b35eec7588a65" as Address;

const WETH_ABI = [
  { name: "deposit",   type: "function", stateMutability: "payable",    inputs: [],                                    outputs: [] },
  { name: "withdraw",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }],    outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }],outputs: [{ name: "", type: "uint256" }] },
] as const;

const ERC4626_ABI = [
  { name: "deposit",         type: "function", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }],                                       outputs: [{ name: "shares", type: "uint256" }] },
  { name: "redeem",          type: "function", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }],  outputs: [{ name: "assets", type: "uint256" }] },
  { name: "balanceOf",       type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }],                                                                              outputs: [{ name: "", type: "uint256" }] },
  { name: "convertToAssets", type: "function", stateMutability: "view",       inputs: [{ name: "shares",  type: "uint256" }],                                                                              outputs: [{ name: "assets", type: "uint256" }] },
] as const;

const MORPHO_VAULTS = [
  {
    id:           "gauntlet-usdc",
    name:         "Gauntlet USDC Core",
    asset:        "USDC",
    assetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    vaultAddress: "0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12" as Address,
    decimals:     6,
    color:        "blue",
    description:  "USDC lending via Morpho Blue. Curated by Gauntlet.",
    morphoUrl:    "https://app.morpho.org/base/vault/0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12/gauntlet-usdc-core",
  },
  {
    id:           "gauntlet-weth",
    name:         "Gauntlet WETH Core",
    asset:        "WETH",
    assetAddress: "0x4200000000000000000000000000000000000006" as Address,
    vaultAddress: "0x6b13c060F13Af1fdB319F52315BbbF3fb1D88844" as Address,
    decimals:     18,
    color:        "indigo",
    description:  "WETH lending via Morpho Blue. Curated by Gauntlet.",
    morphoUrl:    "https://app.morpho.org/base/vault/0x6b13c060F13Af1fdB319F52315BbbF3fb1D88844/gauntlet-weth-core",
  },
] as const;

const colorMap = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-900/20",     border: "border-blue-200 dark:border-blue-800",     text: "text-blue-600 dark:text-blue-300",     badge: "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200"     },
  indigo: { bg: "bg-indigo-50 dark:bg-indigo-900/20", border: "border-indigo-200 dark:border-indigo-800", text: "text-indigo-600 dark:text-indigo-300", badge: "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200" },
};

interface VaultPosition { vaultId: string; shares: bigint; assetsValue: bigint; }
interface VaultApy      { vaultId: string; apy: number | null; totalAssets: string; }
interface LifiQuote     { transactionRequest: { to: string; data: string; value: string }; estimate: { approvalAddress: string; toAmount: string }; }

const MORPHO_API = "https://blue-api.morpho.org/graphql";

// ── Hybrid vault client factory ───────────────────────────────────────────────
async function getVaultClient(walletClient: any, ownerAddress: string) {
  try {
    const code          = await publicClient.getBytecode({ address: ownerAddress as Address });
    const isSmartWallet = !!code && code !== "0x";
    if (isSmartWallet) {
      console.log("[TanamView] Owner is SC wallet → direct vault.execute()");
      return { client: await getDirectVaultClient(walletClient), isSponsored: false };
    }
    console.log("[TanamView] Owner is EOA → sponsored (paymaster) client");
    return { client: await getSmartAccountClient(walletClient), isSponsored: true };
  } catch (e) {
    console.warn("[TanamView] Detection failed, fallback to sponsored:", e);
    return { client: await getSmartAccountClient(walletClient), isSponsored: true };
  }
}

async function getLifiEthQuote(ethAmount: string, toToken: string, fromAddress: string, chainId: number): Promise<LifiQuote> {
  const params = new URLSearchParams({
    fromChain: String(chainId), toChain: String(chainId),
    fromToken: ETH_NATIVE, toToken,
    fromAmount: ethAmount, fromAddress, toAddress: fromAddress,
    slippage: "0.03", denyExchanges: "paraswap",
  });
  const headers: Record<string, string> = { Accept: "application/json" };
  if (LIFI_API_KEY) headers["x-lifi-api-key"] = LIFI_API_KEY;
  const res = await fetch(`${LIFI_API_URL}/quote?${params}`, { headers });
  if (!res.ok) throw new Error(`LI.FI ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  if ((data?.estimate?.approvalAddress || "").toLowerCase() === "0x000000000022d473030f116ddee9f6b43ac78ba3") {
    throw new Error("LI.FI: permit2 route not supported in vault");
  }
  return data as LifiQuote;
}

// ── WETH → USDC quote via LI.FI (/api/quote) ────────────────────────────────
async function getWethToUsdcQuote(wethAmount: bigint, vaultAddress: string, chainId: number) {
  const params = new URLSearchParams({
    chainId:    String(chainId),
    sellToken:  WETH_ADDRESS,
    buyToken:   USDC_ADDRESS,
    sellAmount: wethAmount.toString(),
    taker:      vaultAddress,
    slippage:   "0.03",
  });
  const res = await fetch(`/api/quote?${params}`);
  if (!res.ok) throw new Error(`LI.FI quote failed: ${res.status}`);
  const data = await res.json();
  if (data.error || !data.transaction?.data) throw new Error(data.error || "No route found");
  return data;
}

// ── Farcaster share after YO deposit ──────────────────────────────────────────
async function shareSavedToYo(usdcAmount: string, apy: number | null) {
  const apyText = apy != null ? ` at ${apy.toFixed(2)}% APY` : "";
  const text = `Just turned dust tokens into $${usdcAmount} USDC savings${apyText} using Nyawit × YO Protocol on Base 🐷

Sweep your dust → earn yield`;
  try {
    await sdk.actions.composeCast({
      text,
      embeds: ["https://nyawit-nih-orang.vercel.app"],
    });
  } catch {
    // Not in Farcaster context — silently skip
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export const TanamView = () => {
  const { data: walletClient }             = useWalletClient();
  const { address: ownerAddress, chainId } = useAccount();
  const { switchChainAsync }               = useSwitchChain();
  const { confirm }                        = useAppDialog();

  // YO APY via @yo-protocol/core — useVaults() only returns static config, no APY
  const [yoApy, setYoApy] = useState<number | null>(null);
  const [yoLoading, setYoLoading] = useState(true);
  useEffect(() => {
    const client = createYoClient({ chainId: 8453 });
    client.getVaultSnapshot(YO_USD_VAULT)
      .then((snap: any) => { setYoApy(snap?.apy ?? null); })
      .catch(() => { setYoApy(null); })
      .finally(() => setYoLoading(false));
  }, []);

  const [vaultAddress, setVaultAddress]     = useState<Address | null>(null);
  const [positions, setPositions]           = useState<VaultPosition[]>([]);
  const [apyData, setApyData]               = useState<VaultApy[]>([]);
  const [vaultBalances, setVaultBalances]   = useState<Record<string, string>>({});
  const [ethBalance, setEthBalance]         = useState<bigint>(0n);
  const [wethBalance, setWethBalance]       = useState<bigint>(0n);
  const [usdcBalance, setUsdcBalance]       = useState<bigint>(0n);
  const [yoUsdcBalance, setYoUsdcBalance]   = useState<bigint>(0n); // yoUSD shares held by vault
  const [loading, setLoading]               = useState(false);
  const [depositing, setDepositing]         = useState<string | null>(null);
  const [withdrawing, setWithdrawing]       = useState<string | null>(null);
  const [swapping, setSwapping]             = useState<string | null>(null);
  const [swapProgress, setSwapProgress]     = useState("");
  const [wrapping, setWrapping]             = useState(false);
  const [unwrapping, setUnwrapping]         = useState(false);
  const [wethAction, setWethAction]         = useState("");
  const [toast, setToast]                   = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [isOwnerSmartWallet, setIsOwnerSmartWallet] = useState(false);

  useEffect(() => {
    if (!ownerAddress) return;
    detectVaultAddress(ownerAddress as Address).then(({ address }) => setVaultAddress(address));
    publicClient.getBytecode({ address: ownerAddress as Address })
      .then(code => setIsOwnerSmartWallet(!!code && code !== "0x"))
      .catch(() => setIsOwnerSmartWallet(false));
  }, [ownerAddress]);

  const fetchApyData = useCallback(async () => {
    try {
      const query = `{ vaults(where: { chainId_in: [8453] }, first: 20) { items { address state { apy totalAssets } } } }`;
      const res   = await fetch(MORPHO_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      if (!res.ok) return;
      const json  = await res.json();
      const items = json?.data?.vaults?.items || [];
      setApyData(MORPHO_VAULTS.map(vault => {
        const found = items.find((i: any) => i.address?.toLowerCase() === vault.vaultAddress.toLowerCase());
        return { vaultId: vault.id, apy: found?.state?.apy ? parseFloat(found.state.apy) * 100 : null, totalAssets: found?.state?.totalAssets || "0" };
      }));
    } catch (e) { console.warn("[TanamView] Morpho APY fetch failed:", e); }
  }, []);

  const fetchPositions = useCallback(async () => {
    if (!vaultAddress) return;
    setLoading(true);
    try {
      const [posResults, tokenData, ethBal, wethBal] = await Promise.all([
        Promise.all(MORPHO_VAULTS.map(async vault => {
          try {
            const shares      = await publicClient.readContract({ address: vault.vaultAddress, abi: ERC4626_ABI, functionName: "balanceOf",       args: [vaultAddress] });
            const assetsValue = shares > 0n
              ? await publicClient.readContract({ address: vault.vaultAddress, abi: ERC4626_ABI, functionName: "convertToAssets", args: [shares] })
              : 0n;
            return { vaultId: vault.id, shares, assetsValue } as VaultPosition;
          } catch { return { vaultId: vault.id, shares: 0n, assetsValue: 0n } as VaultPosition; }
        })),
        fetchMoralisTokens(vaultAddress),
        publicClient.getBalance({ address: vaultAddress }),
        publicClient.readContract({ address: WETH_ADDRESS, abi: WETH_ABI, functionName: "balanceOf", args: [vaultAddress] }).catch(() => 0n),
      ]);

      setPositions(posResults);
      setEthBalance(ethBal);
      setWethBalance(wethBal as bigint);

      // Read USDC balance
      const usdcToken = tokenData.find(t => t.token_address.toLowerCase() === USDC_ADDRESS.toLowerCase());
      setUsdcBalance(usdcToken ? BigInt(usdcToken.balance) : 0n);

      // Read yoUSD shares held by vault
      try {
        const yoShares = await publicClient.readContract({
          address: YO_USD_VAULT, abi: ERC4626_ABI, functionName: "balanceOf", args: [vaultAddress],
        });
        setYoUsdcBalance(yoShares as bigint);
      } catch { setYoUsdcBalance(0n); }

      const balMap: Record<string, string> = {};
      for (const vault of MORPHO_VAULTS) {
        const found = tokenData.find(t => t.token_address.toLowerCase() === vault.assetAddress.toLowerCase());
        balMap[vault.id] = found ? found.balance : "0";
      }
      setVaultBalances(balMap);
    } catch (e) { console.error("[TanamView] fetchPositions error:", e); }
    finally { setLoading(false); }
  }, [vaultAddress]);

  useEffect(() => { fetchPositions(); fetchApyData(); }, [fetchPositions, fetchApyData]);

  // ── Wrap ETH → WETH ───────────────────────────────────────────────────────
  const handleWrap = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || ethBalance === 0n) return;
    const wrapAmount = ethBalance > GAS_RESERVE ? ethBalance - GAS_RESERVE : 0n;
    if (wrapAmount === 0n) { setToast({ msg: "Not enough ETH to wrap.", type: "error" }); return; }
    const display = parseFloat(formatUnits(wrapAmount, 18)).toFixed(6);
    const ok = await confirm(
      isOwnerSmartWallet ? `Gas ~$0.0001 from SC wallet.` : `0.00001 ETH reserve kept. Gas sponsored.`,
      { title: `Wrap ${display} ETH → WETH?`, confirmText: "Wrap" }
    );
    if (!ok) return;
    setWrapping(true); setWethAction(`Wrapping ${display} ETH → WETH...`);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const wrapData   = encodeFunctionData({ abi: WETH_ABI, functionName: "deposit", args: [] });
      const txHash     = await client.sendUserOperation({ calls: [{ to: WETH_ADDRESS, value: wrapAmount, data: wrapData }] });
      await client.waitForUserOperationReceipt({ hash: txHash });
      setToast({ msg: `✓ Wrapped ${display} ETH → WETH!`, type: "success" });
      await new Promise(r => setTimeout(r, 2000));
      await fetchPositions();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: msg.includes("rejected") || msg.includes("denied") ? "Cancelled." : "Wrap failed: " + msg, type: "error" });
    } finally { setWrapping(false); setWethAction(""); }
  };

  // ── Unwrap WETH → ETH ─────────────────────────────────────────────────────
  const handleUnwrap = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || wethBalance === 0n) return;
    const display = parseFloat(formatUnits(wethBalance, 18)).toFixed(6);
    const ok = await confirm(
      isOwnerSmartWallet ? `Gas ~$0.0001 from SC wallet.` : `ETH will be in your Smart Vault.`,
      { title: `Unwrap ${display} WETH → ETH?`, confirmText: "Unwrap" }
    );
    if (!ok) return;
    setUnwrapping(true); setWethAction(`Unwrapping ${display} WETH → ETH...`);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const unwrapData = encodeFunctionData({ abi: WETH_ABI, functionName: "withdraw", args: [wethBalance] });
      const txHash     = await client.sendUserOperation({ calls: [{ to: WETH_ADDRESS, value: 0n, data: unwrapData }] });
      await client.waitForUserOperationReceipt({ hash: txHash });
      setToast({ msg: `✓ Unwrapped ${display} WETH → ETH!`, type: "success" });
      await new Promise(r => setTimeout(r, 2000));
      await fetchPositions();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: msg.includes("rejected") || msg.includes("denied") ? "Cancelled." : "Unwrap failed: " + msg, type: "error" });
    } finally { setUnwrapping(false); setWethAction(""); }
  };

  // ── Swap ETH → asset via LI.FI then deposit to Morpho ───────────────────
  const handleSwapAndDeposit = async (vault: typeof MORPHO_VAULTS[number]) => {
    if (!walletClient || !vaultAddress || !ownerAddress || !chainId) return;
    const swapAmount = ethBalance;
    if (swapAmount === 0n) { setToast({ msg: "No ETH in vault to swap.", type: "error" }); return; }
    const ethDisplay = parseFloat(formatUnits(swapAmount, 18)).toFixed(6);
    const ok = await confirm(
      isOwnerSmartWallet ? `Gas ~$0.0001 from SC wallet.` : `Swap ${ethDisplay} ETH → ${vault.asset} via LI.FI, then deposit to Morpho?`,
      { title: `Swap & Deposit to ${vault.name}`, confirmText: "Swap & Deposit" }
    );
    if (!ok) return;
    setSwapping(vault.id); setSwapProgress("Getting quote...");
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const quote      = await getLifiEthQuote(swapAmount.toString(), vault.assetAddress, vaultAddress, chainId);
      setSwapProgress(`Swapping ETH → ${vault.asset}...`);
      const swapTx = await client.sendUserOperation({
        calls: [{ to: quote.transactionRequest.to as Address, value: BigInt(quote.transactionRequest.value || swapAmount.toString()), data: quote.transactionRequest.data as `0x${string}` }],
      });
      await client.waitForUserOperationReceipt({ hash: swapTx });
      setSwapProgress("Reading received balance...");
      const tokenData  = await fetchMoralisTokens(vaultAddress);
      const received   = tokenData.find(t => t.token_address.toLowerCase() === vault.assetAddress.toLowerCase());
      const depositAmt = BigInt(received?.balance || "0");
      if (depositAmt === 0n) { setToast({ msg: `Swap done but no ${vault.asset} found — deposit manually.`, type: "error" }); await fetchPositions(); return; }
      const depositDisplay = parseFloat(formatUnits(depositAmt, vault.decimals)).toFixed(4);
      setSwapProgress(`Approving ${vault.asset} for Morpho...`);
      const approveData = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault.vaultAddress, depositAmt] });
      const approveTx   = await client.sendUserOperation({ calls: [{ to: vault.assetAddress, value: 0n, data: approveData }] });
      await client.waitForUserOperationReceipt({ hash: approveTx });
      setSwapProgress(`Depositing ${depositDisplay} ${vault.asset}...`);
      const depositData = encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [depositAmt, vaultAddress] });
      const depositTx   = await client.sendUserOperation({ calls: [{ to: vault.vaultAddress, value: 0n, data: depositData }] });
      await client.waitForUserOperationReceipt({ hash: depositTx });
      setToast({ msg: `✓ ${depositDisplay} ${vault.asset} deposited to Morpho!`, type: "success" });
      await new Promise(r => setTimeout(r, 3000));
      await fetchPositions();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: msg.includes("rejected") || msg.includes("denied") ? "Cancelled." : "Failed: " + msg, type: "error" });
    } finally { setSwapping(null); setSwapProgress(""); }
  };

  // ── Deposit existing ERC20 to Morpho ─────────────────────────────────────
  const handleDeposit = async (vault: typeof MORPHO_VAULTS[number]) => {
    if (!walletClient || !vaultAddress || !ownerAddress) return;
    const rawBalance = vaultBalances[vault.id];
    if (!rawBalance || BigInt(rawBalance) === 0n) { setToast({ msg: `No ${vault.asset} in vault.`, type: "error" }); return; }
    const amount  = BigInt(rawBalance);
    const display = parseFloat(formatUnits(amount, vault.decimals)).toFixed(4);
    const ok = await confirm(
      isOwnerSmartWallet ? `Gas ~$0.0001 from SC wallet.` : `Funds will earn yield automatically.`,
      { title: `Deposit ${display} ${vault.asset} to ${vault.name}?`, confirmText: "Deposit" }
    );
    if (!ok) return;
    setDepositing(vault.id);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const approveData = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault.vaultAddress, amount] });
      setToast({ msg: `Approving ${vault.asset}...`, type: "success" });
      const approveTx = await client.sendUserOperation({ calls: [{ to: vault.assetAddress, value: 0n, data: approveData }] });
      await client.waitForUserOperationReceipt({ hash: approveTx });
      const depositData = encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [amount, vaultAddress] });
      setToast({ msg: `Depositing ${display} ${vault.asset}...`, type: "success" });
      const depositTx = await client.sendUserOperation({ calls: [{ to: vault.vaultAddress, value: 0n, data: depositData }] });
      await client.waitForUserOperationReceipt({ hash: depositTx });
      setToast({ msg: `✓ ${display} ${vault.asset} deposited to Morpho!`, type: "success" });
      await new Promise(r => setTimeout(r, 3000));
      await fetchPositions();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: msg.includes("rejected") || msg.includes("denied") ? "Cancelled." : "Deposit failed: " + msg, type: "error" });
    } finally { setDepositing(null); }
  };

  // ── Withdraw from Morpho ──────────────────────────────────────────────────
  const handleWithdraw = async (vault: typeof MORPHO_VAULTS[number]) => {
    if (!walletClient || !vaultAddress || !ownerAddress) return;
    const pos = positions.find(p => p.vaultId === vault.id);
    if (!pos || pos.shares === 0n) { setToast({ msg: `No ${vault.asset} position.`, type: "error" }); return; }
    const display = parseFloat(formatUnits(pos.assetsValue, vault.decimals)).toFixed(4);
    const ok = await confirm(
      isOwnerSmartWallet ? `Gas ~$0.0001 from SC wallet.` : `Funds will return to Smart Vault.`,
      { title: `Withdraw ${display} ${vault.asset} from Morpho?`, confirmText: "Withdraw" }
    );
    if (!ok) return;
    setWithdrawing(vault.id);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const redeemData = encodeFunctionData({ abi: ERC4626_ABI, functionName: "redeem", args: [pos.shares, vaultAddress, vaultAddress] });
      const txHash     = await client.sendUserOperation({ calls: [{ to: vault.vaultAddress, value: 0n, data: redeemData }] });
      setToast({ msg: `Withdrawing ${display} ${vault.asset}...`, type: "success" });
      await client.waitForUserOperationReceipt({ hash: txHash });
      setToast({ msg: `✓ ${display} ${vault.asset} returned to vault!`, type: "success" });
      await new Promise(r => setTimeout(r, 3000));
      await fetchPositions();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: msg.includes("rejected") || msg.includes("denied") ? "Cancelled." : "Withdraw failed: " + msg, type: "error" });
    } finally { setWithdrawing(null); }
  };

  // ── YO: Swap WETH → USDC then deposit to yoUSD ───────────────────────────
  const handleSwapWethAndSaveToYo = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || !chainId) return;
    if (wethBalance === 0n) { setToast({ msg: "No WETH in vault to swap.", type: "error" }); return; }
    const wethDisplay = parseFloat(formatUnits(wethBalance, 18)).toFixed(6);
    const ok = await confirm(
      isOwnerSmartWallet ? `Gas ~$0.0001 from SC wallet.` : `Swap ${wethDisplay} WETH → USDC, then deposit to YO.`,
      { title: `Swap WETH → USDC & Save to YO`, confirmText: "Swap & Save" }
    );
    if (!ok) return;
    setSwapping("yo-weth"); setSwapProgress("Getting WETH→USDC quote...");
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);

      // Step 1: approve WETH to router
      const quote = await getWethToUsdcQuote(wethBalance, vaultAddress, chainId);
      setSwapProgress("Approving WETH...");
      const approveWeth = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [quote.transaction.approvalAddress as Address, wethBalance] });
      const approveTx   = await client.sendUserOperation({ calls: [{ to: WETH_ADDRESS, value: 0n, data: approveWeth }] });
      await client.waitForUserOperationReceipt({ hash: approveTx });

      // Step 2: swap WETH → USDC
      setSwapProgress("Swapping WETH → USDC...");
      const swapTx = await client.sendUserOperation({
        calls: [{ to: quote.transaction.to as Address, value: BigInt(quote.transaction.value || "0"), data: quote.transaction.data as `0x${string}` }],
      });
      await client.waitForUserOperationReceipt({ hash: swapTx });

      // Step 3: read actual USDC received
      setSwapProgress("Reading USDC balance...");
      const tokenData  = await fetchMoralisTokens(vaultAddress);
      const received   = tokenData.find(t => t.token_address.toLowerCase() === USDC_ADDRESS.toLowerCase());
      const usdcAmt    = BigInt(received?.balance || "0");
      if (usdcAmt === 0n) { setToast({ msg: "Swap done but no USDC found — deposit manually.", type: "error" }); await fetchPositions(); return; }

      const usdcDisplay = parseFloat(formatUnits(usdcAmt, 6)).toFixed(4);

      // Step 4: approve USDC to yoUSD vault
      setSwapProgress(`Approving $${usdcDisplay} USDC for YO...`);
      const approveUsdc = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [YO_USD_VAULT, usdcAmt] });
      const approveTx2  = await client.sendUserOperation({ calls: [{ to: USDC_ADDRESS, value: 0n, data: approveUsdc }] });
      await client.waitForUserOperationReceipt({ hash: approveTx2 });

      // Step 5: deposit USDC → yoUSD
      setSwapProgress(`Depositing $${usdcDisplay} USDC to YO...`);
      const depositData = encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [usdcAmt, vaultAddress] });
      const depositTx   = await client.sendUserOperation({ calls: [{ to: YO_USD_VAULT, value: 0n, data: depositData }] });
      await client.waitForUserOperationReceipt({ hash: depositTx });

      setToast({ msg: `✓ Swapped WETH and saved $${usdcDisplay} USDC to YO!`, type: "success" });
      shareSavedToYo(usdcDisplay, yoApy);
      await new Promise(r => setTimeout(r, 3000));
      await fetchPositions();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: msg.includes("rejected") || msg.includes("denied") ? "Cancelled." : "Failed: " + msg, type: "error" });
    } finally { setSwapping(null); setSwapProgress(""); }
  };

  // ── YO: Deposit USDC directly to yoUSD ───────────────────────────────────
  const handleDepositToYo = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || usdcBalance === 0n) return;
    const usdcDisplay = parseFloat(formatUnits(usdcBalance, 6)).toFixed(4);
    const ok = await confirm(
      isOwnerSmartWallet ? `Gas ~$0.0001 from SC wallet.` : `USDC will earn yield automatically in YO.`,
      { title: `Save $${usdcDisplay} USDC to YO Protocol?`, confirmText: "Save to YO" }
    );
    if (!ok) return;
    setDepositing("yo");
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const approveData = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [YO_USD_VAULT, usdcBalance] });
      setToast({ msg: "Approving USDC for YO...", type: "success" });
      const approveTx = await client.sendUserOperation({ calls: [{ to: USDC_ADDRESS, value: 0n, data: approveData }] });
      await client.waitForUserOperationReceipt({ hash: approveTx });
      const depositData = encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [usdcBalance, vaultAddress] });
      setToast({ msg: `Depositing $${usdcDisplay} USDC to YO...`, type: "success" });
      const depositTx = await client.sendUserOperation({ calls: [{ to: YO_USD_VAULT, value: 0n, data: depositData }] });
      await client.waitForUserOperationReceipt({ hash: depositTx });
      setToast({ msg: `✓ $${usdcDisplay} USDC saved to YO Protocol!`, type: "success" });
      shareSavedToYo(usdcDisplay, yoApy);
      await new Promise(r => setTimeout(r, 3000));
      await fetchPositions();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: msg.includes("rejected") || msg.includes("denied") ? "Cancelled." : "Deposit failed: " + msg, type: "error" });
    } finally { setDepositing(null); }
  };

  // ── YO: Withdraw from yoUSD ───────────────────────────────────────────────
  const handleWithdrawFromYo = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || yoUsdcBalance === 0n) return;
    // yoUSD is ~1:1 with USDC, estimate display value
    let assetsValue = yoUsdcBalance;
    try {
      assetsValue = await publicClient.readContract({ address: YO_USD_VAULT, abi: ERC4626_ABI, functionName: "convertToAssets", args: [yoUsdcBalance] }) as bigint;
    } catch {}
    const display = parseFloat(formatUnits(assetsValue, 6)).toFixed(4);
    const ok = await confirm(
      isOwnerSmartWallet ? `Gas ~$0.0001 from SC wallet.` : `USDC will return to your Smart Vault.`,
      { title: `Withdraw $${display} USDC from YO?`, confirmText: "Withdraw" }
    );
    if (!ok) return;
    setWithdrawing("yo");
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const redeemData = encodeFunctionData({ abi: ERC4626_ABI, functionName: "redeem", args: [yoUsdcBalance, vaultAddress, vaultAddress] });
      const txHash     = await client.sendUserOperation({ calls: [{ to: YO_USD_VAULT, value: 0n, data: redeemData }] });
      setToast({ msg: `Withdrawing from YO...`, type: "success" });
      await client.waitForUserOperationReceipt({ hash: txHash });
      setToast({ msg: `✓ $${display} USDC returned to vault!`, type: "success" });
      await new Promise(r => setTimeout(r, 3000));
      await fetchPositions();
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: msg.includes("rejected") || msg.includes("denied") ? "Cancelled." : "Withdraw failed: " + msg, type: "error" });
    } finally { setWithdrawing(null); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getApy      = (id: string) => apyData.find(a => a.vaultId === id);
  const getPosition = (id: string) => positions.find(p => p.vaultId === id);
  const isBusy      = (id: string) => depositing === id || withdrawing === id || swapping === id;
  const hasEth      = ethBalance > 100000000000000n;
  const hasWeth     = wethBalance > 0n;
  const hasUsdc     = usdcBalance > 0n;
  const hasYoPos    = yoUsdcBalance > 0n;
  const ethDisplay  = parseFloat(formatUnits(ethBalance, 18)).toFixed(6);
  const wethDisplay = parseFloat(formatUnits(wethBalance, 18)).toFixed(6);
  const usdcDisplay = parseFloat(formatUnits(usdcBalance, 6)).toFixed(2);
  const wethBusy    = wrapping || unwrapping;

  // yoApy is already set via useEffect above
  // Best Morpho USDC APY for comparison
  const morphoUsdcApy = getApy("gauntlet-usdc")?.apy ?? null;

  return (
    <div className="pb-32 space-y-4">
      <SimpleToast message={toast?.msg || null} type={toast?.type} onClose={() => setToast(null)} />

      {/* ── APY Comparison Header ── */}
      <div className="bg-gradient-to-br from-green-900 to-emerald-900 border border-green-700/40 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sprout className="w-4 h-4 text-green-400" strokeWidth={2.5} /> Earn Yield
            </h3>
            <p className="text-xs text-green-300 mt-1">Choose Morpho or YO Protocol — deposit USDC or WETH</p>
            <p className="text-[10px] text-green-500 mt-0.5">
              Auto-compounding · Withdraw anytime
              {isOwnerSmartWallet ? " · Gas: ~$0.0001" : " · Gas: sponsored"}
            </p>
          </div>
          <button onClick={() => { fetchPositions(); fetchApyData(); }} disabled={loading} className="p-2 rounded-lg bg-green-800/50 hover:bg-green-700/50">
            <RefreshCw className={`w-4 h-4 text-green-300 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* APY comparison pills */}
        <div className="mt-3 flex gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-1.5 border border-white/20">
            <span className="text-[10px] text-white/60 font-bold uppercase">YO USDC</span>
            {yoLoading ? (
              <span className="text-xs text-white/40 animate-pulse">...</span>
            ) : yoApy != null ? (
              <span className="text-sm font-black text-yellow-300">{yoApy.toFixed(2)}%</span>
            ) : (
              <span className="text-xs text-white/40">–</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-1.5 border border-white/20">
            <span className="text-[10px] text-white/60 font-bold uppercase">Morpho USDC</span>
            {morphoUsdcApy != null ? (
              <span className="text-sm font-black text-blue-300">{morphoUsdcApy.toFixed(2)}%</span>
            ) : (
              <span className="text-xs text-white/40 animate-pulse">...</span>
            )}
          </div>
        </div>

        {/* Active positions summary */}
        {(positions.some(p => p.assetsValue > 0n) || hasYoPos) && (
          <div className="mt-3 pt-3 border-t border-green-700/40">
            <div className="text-[10px] text-green-400 uppercase font-bold mb-1">Active Positions</div>
            <div className="flex gap-3 flex-wrap">
              {MORPHO_VAULTS.map(vault => {
                const pos = getPosition(vault.id);
                if (!pos || pos.assetsValue === 0n) return null;
                return (
                  <div key={vault.id} className="text-xs text-white">
                    <span className="text-green-400 font-bold">{parseFloat(formatUnits(pos.assetsValue, vault.decimals)).toFixed(4)}</span>{" "}{vault.asset}
                    <span className="text-white/40 text-[9px] ml-1">Morpho</span>
                  </div>
                );
              })}
              {hasYoPos && (
                <div className="text-xs text-white">
                  <span className="text-yellow-300 font-bold">
                    {parseFloat(formatUnits(yoUsdcBalance, 6)).toFixed(4)}
                  </span>{" "}yoUSD
                  <span className="text-white/40 text-[9px] ml-1">YO</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── WETH Wrap / Unwrap ── */}
      {(hasEth || hasWeth) && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-100 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-bold text-emerald-900">Wrap / Unwrap</span>
            <span className="text-[10px] text-emerald-700 ml-auto">ETH ↔ WETH · 1:1</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/60 rounded-xl p-2.5">
              <div className="text-[10px] text-emerald-700 font-medium mb-0.5">ETH in Vault</div>
              <div className={`text-sm font-bold font-mono ${hasEth ? "text-black" : "text-zinc-400"}`}>{ethDisplay}</div>
            </div>
            <div className="bg-white/60 rounded-xl p-2.5">
              <div className="text-[10px] text-emerald-700 font-medium mb-0.5">WETH in Vault</div>
              <div className={`text-sm font-bold font-mono ${hasWeth ? "text-black" : "text-zinc-400"}`}>{wethDisplay}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleWrap} disabled={!hasEth || wethBusy} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              {wrapping ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-xs">{wethAction}</span></> : <>ETH → WETH</>}
            </button>
            <button onClick={handleUnwrap} disabled={!hasWeth || wethBusy} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              {unwrapping ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-xs">{wethAction}</span></> : <>WETH → ETH</>}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* YO PROTOCOL CARD                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-yellow-400/40 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-yellow-700 dark:text-yellow-300">🐷 YO Protocol — yoUSD</span>
              {yoLoading ? (
                <span className="text-[10px] text-zinc-500 animate-pulse">Loading APY...</span>
              ) : yoApy != null ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 flex items-center gap-0.5">
                  <TrendingUp className="w-2.5 h-2.5" />{yoApy.toFixed(2)}% APY
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
              USDC savings vault · ERC-4626 · Auto-compounding
            </p>
          </div>
          <a href="https://app.yo.xyz" target="_blank" rel="noopener noreferrer" className="text-[9px] text-zinc-400 hover:text-yellow-600 underline shrink-0">yo.xyz ↗</a>
        </div>

        {/* Balance tiles */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between text-xs bg-white/70 dark:bg-black/20 rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5 text-zinc-500"><Wallet className="w-3 h-3" /><span>USDC in Vault</span></div>
            <span className={`font-bold ${hasUsdc ? "text-yellow-700 dark:text-yellow-300" : "text-zinc-400"}`}>${usdcDisplay}</span>
          </div>
          <div className="flex items-center justify-between text-xs bg-white/70 dark:bg-black/20 rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5 text-zinc-500"><Wallet className="w-3 h-3" /><span>WETH in Vault</span></div>
            <span className={`font-bold ${hasWeth ? "text-amber-600 dark:text-amber-400" : "text-zinc-400"}`}>{wethDisplay}</span>
          </div>
        </div>

        {/* ── Yield Summary Card — shows when user has YO position ── */}
        {hasYoPos && (() => {
          const principal    = parseFloat(formatUnits(yoUsdcBalance, 6));
          const apy          = yoApy ?? 0;
          const dailyYield   = (principal * apy) / 100 / 365;
          const monthlyYield = dailyYield * 30;
          const annualYield  = (principal * apy) / 100;
          return (
            <div className="rounded-xl bg-gradient-to-br from-yellow-400/15 to-amber-400/10 border border-yellow-400/40 p-3 space-y-2.5">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sprout className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" strokeWidth={2.5} />
                  <span className="text-xs font-bold text-yellow-700 dark:text-yellow-300">Earning at YO</span>
                </div>
                <span className="text-sm font-black text-yellow-700 dark:text-yellow-200">
                  ${principal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </span>
              </div>

              {/* Yield projections grid */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-white/60 dark:bg-black/20 rounded-lg px-2 py-1.5 text-center">
                  <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide">Daily</div>
                  <div className="text-xs font-black text-green-600 dark:text-green-400 mt-0.5">
                    +${dailyYield < 0.001 ? dailyYield.toFixed(5) : dailyYield.toFixed(4)}
                  </div>
                </div>
                <div className="bg-white/60 dark:bg-black/20 rounded-lg px-2 py-1.5 text-center">
                  <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide">Monthly</div>
                  <div className="text-xs font-black text-green-600 dark:text-green-400 mt-0.5">
                    +${monthlyYield.toFixed(3)}
                  </div>
                </div>
                <div className="bg-white/60 dark:bg-black/20 rounded-lg px-2 py-1.5 text-center">
                  <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide">Annual</div>
                  <div className="text-xs font-black text-green-600 dark:text-green-400 mt-0.5">
                    +${annualYield.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* APY label */}
              {yoApy != null && (
                <div className="text-[10px] text-center text-zinc-500">
                  at <span className="font-bold text-yellow-600 dark:text-yellow-400">{yoApy.toFixed(2)}% APY</span>
                  {" · "}auto-compounding · estimates only
                </div>
              )}
            </div>
          );
        })()}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {/* Swap WETH → USDC → YO */}
          {hasWeth && (
            <button
              onClick={handleSwapWethAndSaveToYo}
              disabled={swapping === "yo-weth"}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {swapping === "yo-weth"
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-xs">{swapProgress || "Processing..."}</span></>
                : <><Zap className="w-3.5 h-3.5" />Swap WETH → USDC &amp; Save</>}
            </button>
          )}

          {/* Direct USDC → YO deposit */}
          {hasUsdc && (
            <button
              onClick={handleDepositToYo}
              disabled={!!depositing}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors text-yellow-700 dark:text-yellow-300 bg-white dark:bg-zinc-900 border border-yellow-400/50 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {depositing === "yo"
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving...</>
                : <><ArrowRight className="w-3.5 h-3.5" />Save USDC to YO</>}
            </button>
          )}

          {/* Withdraw from YO */}
          {hasYoPos && (
            <button
              onClick={handleWithdrawFromYo}
              disabled={withdrawing === "yo"}
              className="px-3 py-2.5 rounded-xl font-bold text-sm text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:text-zinc-800 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {withdrawing === "yo" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Withdraw"}
            </button>
          )}
        </div>

        {!hasWeth && !hasUsdc && !hasYoPos && (
          <p className="text-[10px] text-zinc-500 text-center">
            Sweep dust tokens → WETH first, then come back to save to YO.
          </p>
        )}

        {/* YO vault info */}
        <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-yellow-400/20">
          <span>yoUSD · USDC underlying · ERC-4626</span>
          <span>Base Mainnet</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MORPHO VAULTS                                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1 pt-2">
        Morpho Blue Vaults
      </div>

      <div className="space-y-3">
        {loading && positions.length === 0 ? (
          <div className="text-center py-8 animate-pulse text-zinc-500 text-xs">Checking positions...</div>
        ) : (
          MORPHO_VAULTS.map(vault => {
            const colors     = colorMap[vault.color as keyof typeof colorMap];
            const apy        = getApy(vault.id);
            const pos        = getPosition(vault.id);
            const rawBal     = vaultBalances[vault.id] || "0";
            const hasBal     = BigInt(rawBal) > 0n;
            const hasPos     = pos && pos.assetsValue > 0n;
            const balDisplay = hasBal ? parseFloat(formatUnits(BigInt(rawBal), vault.decimals)).toFixed(4) : "0";
            const posDisplay = hasPos ? parseFloat(formatUnits(pos.assetsValue, vault.decimals)).toFixed(6) : null;
            const busy       = isBusy(vault.id);

            return (
              <div key={vault.id} className={`rounded-2xl border ${colors.border} ${colors.bg} p-4 space-y-3`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${colors.text}`}>{vault.name}</span>
                      {apy?.apy != null ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colors.badge} flex items-center gap-0.5`}>
                          <TrendingUp className="w-2.5 h-2.5" />{apy.apy.toFixed(2)}% APY
                        </span>
                      ) : <span className="text-[10px] text-zinc-500 animate-pulse">APY loading...</span>}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{vault.description}</p>
                  </div>
                  <a href={vault.morphoUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-zinc-500 hover:text-zinc-300 underline shrink-0">morpho.org ↗</a>
                </div>

                <div className="flex items-center justify-between text-xs bg-white/50 dark:bg-black/20 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-1.5 text-zinc-500"><Wallet className="w-3 h-3" /><span>In Smart Vault</span></div>
                  <span className={`font-bold ${hasBal ? colors.text : "text-zinc-400"}`}>{balDisplay} {vault.asset}</span>
                </div>

                {hasPos && (
                  <div className="flex items-center justify-between text-xs bg-green-500/10 rounded-xl px-3 py-2 border border-green-500/20">
                    <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-100"><Sprout className="w-3 h-3" strokeWidth={2.5} /><span>Earning at Morpho</span></div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-100">{posDisplay} {vault.asset}</span>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {hasEth && (
                    <button onClick={() => handleSwapAndDeposit(vault)} disabled={busy}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 disabled:opacity-40 disabled:cursor-not-allowed">
                      {swapping === vault.id
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-xs">{swapProgress || "Processing..."}</span></>
                        : <><Zap className="w-3.5 h-3.5" />Swap ETH → {vault.asset} &amp; Deposit</>}
                    </button>
                  )}
                  {hasBal && (
                    <button onClick={() => handleDeposit(vault)} disabled={busy}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors ${colors.text} bg-white dark:bg-zinc-900 border ${colors.border} hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed`}>
                      {depositing === vault.id
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Depositing...</>
                        : <><ArrowRight className="w-3.5 h-3.5" />Deposit {vault.asset}</>}
                    </button>
                  )}
                  {hasPos && (
                    <button onClick={() => handleWithdraw(vault)} disabled={busy}
                      className="px-3 py-2.5 rounded-xl font-bold text-sm text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-700 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {withdrawing === vault.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Withdraw"}
                    </button>
                  )}
                </div>

                {!hasBal && !hasPos && !hasEth && (
                  <p className="text-[10px] text-zinc-500 text-center">Sweep dust to WETH first, then come back.</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-1.5">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">How it works</p>
        <div className="space-y-1 text-xs text-zinc-500">
          <div className="flex gap-2"><span className="text-yellow-500 shrink-0">1.</span><span>Sweep dust tokens to WETH in the Sweep tab</span></div>
          <div className="flex gap-2"><span className="text-yellow-500 shrink-0">2.</span><span>Save to <strong>YO</strong> (swap WETH→USDC + deposit) <em>or</em> deposit to <strong>Morpho</strong></span></div>
          <div className="flex gap-2"><span className="text-yellow-500 shrink-0">3.</span><span>Yield accumulates automatically · Withdraw to vault anytime</span></div>
        </div>
        <p className="text-[9px] text-zinc-600 pt-1">
          YO Protocol (ERC-4626) · Morpho Blue · Swap via 0x/LI.FI · Non-custodial · Smart contract risk applies
        </p>
      </div>
    </div>
  );
};
