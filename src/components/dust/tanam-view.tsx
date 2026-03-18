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
const ETH_NATIVE   = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const LIFI_API_URL = "https://li.quest/v1";
const LIFI_API_KEY = process.env.NEXT_PUBLIC_LIFI_API_KEY || "";
const GAS_RESERVE  = 10000000000000n;

// ── YO Protocol Vaults on Base ────────────────────────────────────────────────
const YO_VAULTS = [
  {
    id: "yoUSD" as const,
    name: "yoUSD", emoji: "💵",
    vaultAddress:      "0x0000000f2eb9f69274678c76222b35eec7588a65" as Address,
    underlying:        "USDC",
    underlyingAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as Address,
    decimals: 6, isWethUnderlying: false,
    borderColor: "border-yellow-400/40",
    bgColor:     "from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20",
    textColor:   "text-yellow-700 dark:text-yellow-300",
    badgeColor:  "bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200",
  },
  {
    id: "yoETH" as const,
    name: "yoETH", emoji: "⚡",
    vaultAddress:      "0x3a43aec53490cb9fa922847385d82fe25d0e9de7" as Address,
    underlying:        "WETH",
    underlyingAddress: "0x4200000000000000000000000000000000000006" as Address,
    decimals: 18, isWethUnderlying: true,
    borderColor: "border-blue-400/40",
    bgColor:     "from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20",
    textColor:   "text-blue-700 dark:text-blue-300",
    badgeColor:  "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200",
  },
  {
    id: "yoBTC" as const,
    name: "yoBTC", emoji: "₿",
    vaultAddress:      "0xbcbc8cb4d1e8ed048a6276a5e94a3e952660bcbc" as Address,
    underlying:        "cbBTC",
    underlyingAddress: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" as Address,
    decimals: 8, isWethUnderlying: false,
    borderColor: "border-orange-400/40",
    bgColor:     "from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20",
    textColor:   "text-orange-700 dark:text-orange-300",
    badgeColor:  "bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200",
  },
  {
    id: "yoEUR" as const,
    name: "yoEUR", emoji: "€",
    vaultAddress:      "0x50c749ae210d3977adc824ae11f3c7fd10c871e9" as Address,
    underlying:        "EURC",
    underlyingAddress: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as Address,
    decimals: 6, isWethUnderlying: false,
    borderColor: "border-purple-400/40",
    bgColor:     "from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20",
    textColor:   "text-purple-700 dark:text-purple-300",
    badgeColor:  "bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200",
  },
] as const;

type YoVaultId = typeof YO_VAULTS[number]["id"];

// ── Morpho Vaults ─────────────────────────────────────────────────────────────
const MORPHO_VAULTS = [
  {
    id: "gauntlet-usdc", name: "Gauntlet USDC Core", asset: "USDC",
    assetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    vaultAddress: "0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12" as Address,
    decimals: 6, color: "blue",
    description: "USDC lending via Morpho Blue. Curated by Gauntlet.",
    morphoUrl: "https://app.morpho.org/base/vault/0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12/gauntlet-usdc-core",
  },
  {
    id: "gauntlet-weth", name: "Gauntlet WETH Core", asset: "WETH",
    assetAddress: "0x4200000000000000000000000000000000000006" as Address,
    vaultAddress: "0x6b13c060F13Af1fdB319F52315BbbF3fb1D88844" as Address,
    decimals: 18, color: "indigo",
    description: "WETH lending via Morpho Blue. Curated by Gauntlet.",
    morphoUrl: "https://app.morpho.org/base/vault/0x6b13c060F13Af1fdB319F52315BbbF3fb1D88844/gauntlet-weth-core",
  },
] as const;

const morphoColors = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-900/20",     border: "border-blue-200 dark:border-blue-800",     text: "text-blue-600 dark:text-blue-300",     badge: "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200"     },
  indigo: { bg: "bg-indigo-50 dark:bg-indigo-900/20", border: "border-indigo-200 dark:border-indigo-800", text: "text-indigo-600 dark:text-indigo-300", badge: "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200" },
};

// ── ABIs ──────────────────────────────────────────────────────────────────────
const WETH_ABI = [
  { name: "deposit",   type: "function", stateMutability: "payable",    inputs: [],                                     outputs: [] },
  { name: "withdraw",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }],     outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const ERC4626_ABI = [
  { name: "deposit",         type: "function", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }],                                      outputs: [{ name: "shares", type: "uint256" }] },
  { name: "redeem",          type: "function", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }], outputs: [{ name: "assets", type: "uint256" }] },
  { name: "balanceOf",       type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }],                                                                             outputs: [{ name: "", type: "uint256" }] },
  { name: "convertToAssets", type: "function", stateMutability: "view",       inputs: [{ name: "shares",  type: "uint256" }],                                                                             outputs: [{ name: "assets", type: "uint256" }] },
] as const;

interface MorphoPosition { vaultId: string; shares: bigint; assetsValue: bigint; }
interface MorphoApy      { vaultId: string; apy: number | null; totalAssets: string; }
const MORPHO_API = "https://blue-api.morpho.org/graphql";

// ── Vault client factory ──────────────────────────────────────────────────────
async function getVaultClient(walletClient: any, ownerAddress: string) {
  try {
    const code = await publicClient.getBytecode({ address: ownerAddress as Address });
    if (!!code && code !== "0x") return { client: await getDirectVaultClient(walletClient), isSponsored: false };
    return { client: await getSmartAccountClient(walletClient), isSponsored: true };
  } catch {
    return { client: await getSmartAccountClient(walletClient), isSponsored: true };
  }
}

// ── LI.FI: generic token → token swap quote ──────────────────────────────────
async function getLifiSwapQuote(sellToken: string, buyToken: string, sellAmount: bigint, fromAddress: string, chainId: number) {
  const params = new URLSearchParams({ chainId: String(chainId), sellToken, buyToken, sellAmount: sellAmount.toString(), taker: fromAddress, slippage: "0.03" });
  const res  = await fetch(`/api/quote?${params}`);
  if (!res.ok) throw new Error(`LI.FI quote failed: ${res.status}`);
  const data = await res.json();
  if (data.error || !data.transaction?.data) throw new Error(data.error || "No route found");
  return data;
}

// ── LI.FI: ETH → token swap quote ────────────────────────────────────────────
async function getLifiEthQuote(ethAmount: string, toToken: string, fromAddress: string, chainId: number) {
  const params = new URLSearchParams({ fromChain: String(chainId), toChain: String(chainId), fromToken: ETH_NATIVE, toToken, fromAmount: ethAmount, fromAddress, toAddress: fromAddress, slippage: "0.03", denyExchanges: "paraswap" });
  const headers: Record<string, string> = { Accept: "application/json" };
  if (LIFI_API_KEY) headers["x-lifi-api-key"] = LIFI_API_KEY;
  const res  = await fetch(`${LIFI_API_URL}/quote?${params}`, { headers });
  if (!res.ok) throw new Error(`LI.FI ETH quote ${res.status}`);
  const data = await res.json();
  if ((data?.estimate?.approvalAddress || "").toLowerCase() === "0x000000000022d473030f116ddee9f6b43ac78ba3") throw new Error("permit2 route not supported");
  return data;
}

// ── Farcaster share ───────────────────────────────────────────────────────────
async function shareSavedToYo(amount: string, asset: string, apy: number | null) {
  const apyText = apy != null ? ` at ${apy.toFixed(2)}% APY` : "";
  try {
    await sdk.actions.composeCast({
      text: `Just turned dust tokens into ${amount} ${asset} savings${apyText} using Nyawit × YO Protocol on Base 🐷\n\nSweep your dust → earn yield`,
      embeds: ["https://nyawit-nih-orang.vercel.app"],
    });
  } catch { /* not in Farcaster context */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
export const TanamView = () => {
  const { data: walletClient }             = useWalletClient();
  const { address: ownerAddress, chainId } = useAccount();
  const { switchChainAsync }               = useSwitchChain();
  const { confirm }                        = useAppDialog();

  // YO APY map — fetch all 4 vaults in parallel
  const [yoApyMap, setYoApyMap]   = useState<Record<string, number | null>>({});
  const [yoLoading, setYoLoading] = useState(true);
  useEffect(() => {
    const client = createYoClient({ chainId: 8453 });
    Promise.all(YO_VAULTS.map(v =>
      client.getVaultSnapshot(v.vaultAddress)
        .then((snap: any) => ({ id: v.id, apy: snap?.apy ?? null }))
        .catch(() => ({ id: v.id, apy: null }))
    )).then(results => {
      const map: Record<string, number | null> = {};
      results.forEach(r => { map[r.id] = r.apy; });
      setYoApyMap(map);
    }).finally(() => setYoLoading(false));
  }, []);

  const [vaultAddress, setVaultAddress]       = useState<Address | null>(null);
  const [morphoPositions, setMorphoPositions] = useState<MorphoPosition[]>([]);
  const [morphoApyData, setMorphoApyData]     = useState<MorphoApy[]>([]);
  const [morphoBalances, setMorphoBalances]   = useState<Record<string, string>>({});
  const [ethBalance, setEthBalance]           = useState<bigint>(0n);
  const [wethBalance, setWethBalance]         = useState<bigint>(0n);
  const [yoUnderlyingBal, setYoUnderlyingBal] = useState<Record<string, bigint>>({});
  const [yoSharesBal, setYoSharesBal]         = useState<Record<string, bigint>>({});
  const [loading, setLoading]                 = useState(false);
  const [depositing, setDepositing]           = useState<string | null>(null);
  const [withdrawing, setWithdrawing]         = useState<string | null>(null);
  const [swapping, setSwapping]               = useState<string | null>(null);
  const [swapProgress, setSwapProgress]       = useState("");
  const [wrapping, setWrapping]               = useState(false);
  const [unwrapping, setUnwrapping]           = useState(false);
  const [wethAction, setWethAction]           = useState("");
  const [toast, setToast]                     = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [isOwnerSCWallet, setIsOwnerSCWallet] = useState(false);

  useEffect(() => {
    if (!ownerAddress) return;
    detectVaultAddress(ownerAddress as Address).then(({ address }) => setVaultAddress(address));
    publicClient.getBytecode({ address: ownerAddress as Address })
      .then(code => setIsOwnerSCWallet(!!code && code !== "0x"))
      .catch(() => setIsOwnerSCWallet(false));
  }, [ownerAddress]);

  const fetchMorphoApy = useCallback(async () => {
    try {
      const res  = await fetch(MORPHO_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: `{ vaults(where: { chainId_in: [8453] }, first: 20) { items { address state { apy totalAssets } } } }` }) });
      const json = await res.json();
      const items = json?.data?.vaults?.items || [];
      setMorphoApyData(MORPHO_VAULTS.map(v => {
        const f = items.find((i: any) => i.address?.toLowerCase() === v.vaultAddress.toLowerCase());
        return { vaultId: v.id, apy: f?.state?.apy ? parseFloat(f.state.apy) * 100 : null, totalAssets: f?.state?.totalAssets || "0" };
      }));
    } catch {}
  }, []);

  const fetchPositions = useCallback(async () => {
    if (!vaultAddress) return;
    setLoading(true);
    try {
      const [morphoRes, tokenData, ethBal, wethBal, ...yoShareResults] = await Promise.all([
        Promise.all(MORPHO_VAULTS.map(async v => {
          try {
            const shares = await publicClient.readContract({ address: v.vaultAddress, abi: ERC4626_ABI, functionName: "balanceOf", args: [vaultAddress] });
            const assets = shares > 0n ? await publicClient.readContract({ address: v.vaultAddress, abi: ERC4626_ABI, functionName: "convertToAssets", args: [shares] }) : 0n;
            return { vaultId: v.id, shares, assetsValue: assets } as MorphoPosition;
          } catch { return { vaultId: v.id, shares: 0n, assetsValue: 0n } as MorphoPosition; }
        })),
        fetchMoralisTokens(vaultAddress),
        publicClient.getBalance({ address: vaultAddress }),
        publicClient.readContract({ address: WETH_ADDRESS, abi: WETH_ABI, functionName: "balanceOf", args: [vaultAddress] }).catch(() => 0n),
        ...YO_VAULTS.map(v => publicClient.readContract({ address: v.vaultAddress, abi: ERC4626_ABI, functionName: "balanceOf", args: [vaultAddress] }).catch(() => 0n)),
      ]);

      setMorphoPositions(morphoRes);
      setEthBalance(ethBal);
      setWethBalance(wethBal as bigint);

      const sharesMap: Record<string, bigint> = {};
      YO_VAULTS.forEach((v, i) => { sharesMap[v.id] = yoShareResults[i] as bigint; });
      setYoSharesBal(sharesMap);

      const underlyingMap: Record<string, bigint> = {};
      for (const v of YO_VAULTS) {
        if (v.isWethUnderlying) {
          underlyingMap[v.id] = wethBal as bigint;
        } else {
          const found = tokenData.find(t => t.token_address.toLowerCase() === v.underlyingAddress.toLowerCase());
          underlyingMap[v.id] = found ? BigInt(found.balance) : 0n;
        }
      }
      setYoUnderlyingBal(underlyingMap);

      const balMap: Record<string, string> = {};
      for (const v of MORPHO_VAULTS) {
        const found = tokenData.find(t => t.token_address.toLowerCase() === v.assetAddress.toLowerCase());
        balMap[v.id] = found ? found.balance : "0";
      }
      setMorphoBalances(balMap);
    } catch (e) { console.error("[TanamView] fetchPositions error:", e); }
    finally { setLoading(false); }
  }, [vaultAddress]);

  useEffect(() => { fetchPositions(); fetchMorphoApy(); }, [fetchPositions, fetchMorphoApy]);

  // ── Wrap / Unwrap ─────────────────────────────────────────────────────────
  const handleWrap = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || ethBalance === 0n) return;
    const wrapAmount = ethBalance > GAS_RESERVE ? ethBalance - GAS_RESERVE : 0n;
    if (wrapAmount === 0n) { setToast({ msg: "Not enough ETH to wrap.", type: "error" }); return; }
    const display = parseFloat(formatUnits(wrapAmount, 18)).toFixed(6);
    if (!await confirm(isOwnerSCWallet ? `Gas ~$0.0001 from SC wallet.` : `0.00001 ETH reserve kept.`, { title: `Wrap ${display} ETH → WETH?`, confirmText: "Wrap" })) return;
    setWrapping(true); setWethAction(`Wrapping ${display} ETH → WETH...`);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const tx = await client.sendUserOperation({ calls: [{ to: WETH_ADDRESS, value: wrapAmount, data: encodeFunctionData({ abi: WETH_ABI, functionName: "deposit", args: [] }) }] });
      await client.waitForUserOperationReceipt({ hash: tx });
      setToast({ msg: `✓ Wrapped ${display} ETH → WETH!`, type: "success" });
      await new Promise(r => setTimeout(r, 2000)); await fetchPositions();
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: m.includes("rejected") || m.includes("denied") ? "Cancelled." : "Wrap failed: " + m, type: "error" });
    } finally { setWrapping(false); setWethAction(""); }
  };

  const handleUnwrap = async () => {
    if (!walletClient || !vaultAddress || !ownerAddress || wethBalance === 0n) return;
    const display = parseFloat(formatUnits(wethBalance, 18)).toFixed(6);
    if (!await confirm(isOwnerSCWallet ? `Gas ~$0.0001 from SC wallet.` : `ETH will be in your Smart Vault.`, { title: `Unwrap ${display} WETH → ETH?`, confirmText: "Unwrap" })) return;
    setUnwrapping(true); setWethAction(`Unwrapping ${display} WETH → ETH...`);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const tx = await client.sendUserOperation({ calls: [{ to: WETH_ADDRESS, value: 0n, data: encodeFunctionData({ abi: WETH_ABI, functionName: "withdraw", args: [wethBalance] }) }] });
      await client.waitForUserOperationReceipt({ hash: tx });
      setToast({ msg: `✓ Unwrapped ${display} WETH → ETH!`, type: "success" });
      await new Promise(r => setTimeout(r, 2000)); await fetchPositions();
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: m.includes("rejected") || m.includes("denied") ? "Cancelled." : "Unwrap failed: " + m, type: "error" });
    } finally { setUnwrapping(false); setWethAction(""); }
  };

  // ── YO: Direct deposit ────────────────────────────────────────────────────
  const handleDepositToYo = async (vaultId: YoVaultId) => {
    if (!walletClient || !vaultAddress || !ownerAddress) return;
    const v = YO_VAULTS.find(x => x.id === vaultId)!;
    const balance = yoUnderlyingBal[vaultId] ?? 0n;
    if (balance === 0n) { setToast({ msg: `No ${v.underlying} in vault.`, type: "error" }); return; }
    const display = parseFloat(formatUnits(balance, v.decimals)).toFixed(v.decimals === 8 ? 6 : 4);
    if (!await confirm(isOwnerSCWallet ? `Gas ~$0.0001 from SC wallet.` : `${v.underlying} will earn yield in ${v.name}.`, { title: `Save ${display} ${v.underlying} to ${v.name}?`, confirmText: "Save to YO" })) return;
    setDepositing(vaultId);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const approveTx = await client.sendUserOperation({ calls: [{ to: v.underlyingAddress, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [v.vaultAddress, balance] }) }] });
      await client.waitForUserOperationReceipt({ hash: approveTx });
      const depositTx = await client.sendUserOperation({ calls: [{ to: v.vaultAddress, value: 0n, data: encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [balance, vaultAddress] }) }] });
      await client.waitForUserOperationReceipt({ hash: depositTx });
      setToast({ msg: `✓ ${display} ${v.underlying} saved to ${v.name}!`, type: "success" });
      shareSavedToYo(display, v.underlying, yoApyMap[vaultId] ?? null);
      await new Promise(r => setTimeout(r, 3000)); await fetchPositions();
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: m.includes("rejected") || m.includes("denied") ? "Cancelled." : "Deposit failed: " + m, type: "error" });
    } finally { setDepositing(null); }
  };

  // ── YO: Swap WETH → underlying via LI.FI, then deposit ───────────────────
  const handleSwapAndSaveToYo = async (vaultId: YoVaultId) => {
    if (!walletClient || !vaultAddress || !ownerAddress || !chainId) return;
    const v = YO_VAULTS.find(x => x.id === vaultId)!;
    if (wethBalance === 0n) { setToast({ msg: "No WETH in vault to swap.", type: "error" }); return; }
    const wethDisplay = parseFloat(formatUnits(wethBalance, 18)).toFixed(6);
    if (!await confirm(isOwnerSCWallet ? `Gas ~$0.0001 from SC wallet.` : `Swap ${wethDisplay} WETH → ${v.underlying}, then save to ${v.name}.`, { title: `Swap WETH → ${v.underlying} & Save`, confirmText: "Swap & Save" })) return;
    setSwapping(vaultId); setSwapProgress(`Getting WETH→${v.underlying} quote...`);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const quote = await getLifiSwapQuote(WETH_ADDRESS, v.underlyingAddress, wethBalance, vaultAddress, chainId);
      setSwapProgress("Approving WETH...");
      const approveTx = await client.sendUserOperation({ calls: [{ to: WETH_ADDRESS, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [quote.transaction.approvalAddress as Address, wethBalance] }) }] });
      await client.waitForUserOperationReceipt({ hash: approveTx });
      setSwapProgress(`Swapping WETH → ${v.underlying}...`);
      const swapTx = await client.sendUserOperation({ calls: [{ to: quote.transaction.to as Address, value: BigInt(quote.transaction.value || "0"), data: quote.transaction.data as `0x${string}` }] });
      await client.waitForUserOperationReceipt({ hash: swapTx });
      setSwapProgress(`Reading ${v.underlying} balance...`);
      const tokenData = await fetchMoralisTokens(vaultAddress);
      const received  = tokenData.find(t => t.token_address.toLowerCase() === v.underlyingAddress.toLowerCase());
      const recvAmt   = BigInt(received?.balance || "0");
      if (recvAmt === 0n) { setToast({ msg: `Swap done but no ${v.underlying} found.`, type: "error" }); await fetchPositions(); return; }
      const recvDisplay = parseFloat(formatUnits(recvAmt, v.decimals)).toFixed(v.decimals === 8 ? 6 : 4);
      setSwapProgress(`Approving ${v.underlying}...`);
      const approveTx2 = await client.sendUserOperation({ calls: [{ to: v.underlyingAddress, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [v.vaultAddress, recvAmt] }) }] });
      await client.waitForUserOperationReceipt({ hash: approveTx2 });
      setSwapProgress(`Depositing to ${v.name}...`);
      const depositTx = await client.sendUserOperation({ calls: [{ to: v.vaultAddress, value: 0n, data: encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [recvAmt, vaultAddress] }) }] });
      await client.waitForUserOperationReceipt({ hash: depositTx });
      setToast({ msg: `✓ Swapped WETH and saved ${recvDisplay} ${v.underlying} to ${v.name}!`, type: "success" });
      shareSavedToYo(recvDisplay, v.underlying, yoApyMap[vaultId] ?? null);
      await new Promise(r => setTimeout(r, 3000)); await fetchPositions();
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: m.includes("rejected") || m.includes("denied") ? "Cancelled." : "Failed: " + m, type: "error" });
    } finally { setSwapping(null); setSwapProgress(""); }
  };

  // ── YO: Withdraw ──────────────────────────────────────────────────────────
  const handleWithdrawFromYo = async (vaultId: YoVaultId) => {
    if (!walletClient || !vaultAddress || !ownerAddress) return;
    const v      = YO_VAULTS.find(x => x.id === vaultId)!;
    const shares = yoSharesBal[vaultId] ?? 0n;
    if (shares === 0n) { setToast({ msg: `No position in ${v.name}.`, type: "error" }); return; }
    let assetsValue = shares;
    try { assetsValue = await publicClient.readContract({ address: v.vaultAddress, abi: ERC4626_ABI, functionName: "convertToAssets", args: [shares] }) as bigint; } catch {}
    const display = parseFloat(formatUnits(assetsValue, v.decimals)).toFixed(v.decimals === 8 ? 6 : 4);
    if (!await confirm(isOwnerSCWallet ? `Gas ~$0.0001 from SC wallet.` : `${v.underlying} will return to Smart Vault.`, { title: `Withdraw ${display} ${v.underlying} from ${v.name}?`, confirmText: "Withdraw" })) return;
    setWithdrawing(vaultId);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const tx = await client.sendUserOperation({ calls: [{ to: v.vaultAddress, value: 0n, data: encodeFunctionData({ abi: ERC4626_ABI, functionName: "redeem", args: [shares, vaultAddress, vaultAddress] }) }] });
      await client.waitForUserOperationReceipt({ hash: tx });
      setToast({ msg: `✓ ${display} ${v.underlying} returned to vault!`, type: "success" });
      await new Promise(r => setTimeout(r, 3000)); await fetchPositions();
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: m.includes("rejected") || m.includes("denied") ? "Cancelled." : "Withdraw failed: " + m, type: "error" });
    } finally { setWithdrawing(null); }
  };

  // ── Morpho handlers ───────────────────────────────────────────────────────
  const handleMorphoSwapAndDeposit = async (vault: typeof MORPHO_VAULTS[number]) => {
    if (!walletClient || !vaultAddress || !ownerAddress || !chainId || ethBalance === 0n) return;
    const ethDisplay = parseFloat(formatUnits(ethBalance, 18)).toFixed(6);
    if (!await confirm(isOwnerSCWallet ? `Gas ~$0.0001.` : `Swap ${ethDisplay} ETH → ${vault.asset} via LI.FI, then deposit to Morpho.`, { title: `Swap & Deposit to ${vault.name}`, confirmText: "Swap & Deposit" })) return;
    setSwapping(vault.id); setSwapProgress("Getting quote...");
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const quote   = await getLifiEthQuote(ethBalance.toString(), vault.assetAddress, vaultAddress, chainId);
      setSwapProgress(`Swapping ETH → ${vault.asset}...`);
      const swapTx  = await client.sendUserOperation({ calls: [{ to: quote.transactionRequest.to as Address, value: BigInt(quote.transactionRequest.value || ethBalance.toString()), data: quote.transactionRequest.data as `0x${string}` }] });
      await client.waitForUserOperationReceipt({ hash: swapTx });
      setSwapProgress("Reading balance...");
      const tokenData  = await fetchMoralisTokens(vaultAddress);
      const received   = tokenData.find(t => t.token_address.toLowerCase() === vault.assetAddress.toLowerCase());
      const depositAmt = BigInt(received?.balance || "0");
      if (depositAmt === 0n) { setToast({ msg: `Swap done but no ${vault.asset} found.`, type: "error" }); await fetchPositions(); return; }
      const dd = parseFloat(formatUnits(depositAmt, vault.decimals)).toFixed(4);
      setSwapProgress(`Depositing ${dd} ${vault.asset}...`);
      const approveTx = await client.sendUserOperation({ calls: [{ to: vault.assetAddress, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault.vaultAddress, depositAmt] }) }] });
      await client.waitForUserOperationReceipt({ hash: approveTx });
      const depositTx = await client.sendUserOperation({ calls: [{ to: vault.vaultAddress, value: 0n, data: encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [depositAmt, vaultAddress] }) }] });
      await client.waitForUserOperationReceipt({ hash: depositTx });
      setToast({ msg: `✓ ${dd} ${vault.asset} deposited to Morpho!`, type: "success" });
      await new Promise(r => setTimeout(r, 3000)); await fetchPositions();
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: m.includes("rejected") || m.includes("denied") ? "Cancelled." : "Failed: " + m, type: "error" });
    } finally { setSwapping(null); setSwapProgress(""); }
  };

  const handleMorphoDeposit = async (vault: typeof MORPHO_VAULTS[number]) => {
    if (!walletClient || !vaultAddress || !ownerAddress) return;
    const rawBal = morphoBalances[vault.id];
    if (!rawBal || BigInt(rawBal) === 0n) { setToast({ msg: `No ${vault.asset} in vault.`, type: "error" }); return; }
    const amount  = BigInt(rawBal);
    const display = parseFloat(formatUnits(amount, vault.decimals)).toFixed(4);
    if (!await confirm(isOwnerSCWallet ? `Gas ~$0.0001.` : `Funds will earn yield automatically.`, { title: `Deposit ${display} ${vault.asset} to ${vault.name}?`, confirmText: "Deposit" })) return;
    setDepositing(vault.id);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const approveTx = await client.sendUserOperation({ calls: [{ to: vault.assetAddress, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault.vaultAddress, amount] }) }] });
      await client.waitForUserOperationReceipt({ hash: approveTx });
      const depositTx = await client.sendUserOperation({ calls: [{ to: vault.vaultAddress, value: 0n, data: encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [amount, vaultAddress] }) }] });
      await client.waitForUserOperationReceipt({ hash: depositTx });
      setToast({ msg: `✓ ${display} ${vault.asset} deposited to Morpho!`, type: "success" });
      await new Promise(r => setTimeout(r, 3000)); await fetchPositions();
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: m.includes("rejected") || m.includes("denied") ? "Cancelled." : "Deposit failed: " + m, type: "error" });
    } finally { setDepositing(null); }
  };

  const handleMorphoWithdraw = async (vault: typeof MORPHO_VAULTS[number]) => {
    if (!walletClient || !vaultAddress || !ownerAddress) return;
    const pos = morphoPositions.find(p => p.vaultId === vault.id);
    if (!pos || pos.shares === 0n) { setToast({ msg: `No ${vault.asset} position.`, type: "error" }); return; }
    const display = parseFloat(formatUnits(pos.assetsValue, vault.decimals)).toFixed(4);
    if (!await confirm(isOwnerSCWallet ? `Gas ~$0.0001.` : `Funds will return to Smart Vault.`, { title: `Withdraw ${display} ${vault.asset} from Morpho?`, confirmText: "Withdraw" })) return;
    setWithdrawing(vault.id);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const { client } = await getVaultClient(walletClient, ownerAddress);
      const tx = await client.sendUserOperation({ calls: [{ to: vault.vaultAddress, value: 0n, data: encodeFunctionData({ abi: ERC4626_ABI, functionName: "redeem", args: [pos.shares, vaultAddress, vaultAddress] }) }] });
      await client.waitForUserOperationReceipt({ hash: tx });
      setToast({ msg: `✓ ${display} ${vault.asset} returned to vault!`, type: "success" });
      await new Promise(r => setTimeout(r, 3000)); await fetchPositions();
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Unknown";
      setToast({ msg: m.includes("rejected") || m.includes("denied") ? "Cancelled." : "Withdraw failed: " + m, type: "error" });
    } finally { setWithdrawing(null); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isBusy        = (id: string) => depositing === id || withdrawing === id || swapping === id;
  const hasEth        = ethBalance > 100000000000000n;
  const hasWeth       = wethBalance > 0n;
  const wethBusy      = wrapping || unwrapping;
  const bestYoApy     = Object.values(yoApyMap).reduce<number | null>((best, apy) => apy != null && (best == null || apy > best) ? apy : best, null);
  const morphoUsdcApy = morphoApyData.find(a => a.vaultId === "gauntlet-usdc")?.apy ?? null;

  return (
    <div className="pb-32 space-y-4">
      <SimpleToast message={toast?.msg || null} type={toast?.type} onClose={() => setToast(null)} />

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-green-900 to-emerald-900 border border-green-700/40 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sprout className="w-4 h-4 text-green-400" strokeWidth={2.5} /> Earn Yield
            </h3>
            <p className="text-xs text-green-300 mt-1">4 YO vaults + Morpho Blue · deposit any asset</p>
            <p className="text-[10px] text-green-500 mt-0.5">Auto-compounding · Withdraw anytime · Swap via LI.FI</p>
          </div>
          <button onClick={() => { fetchPositions(); fetchMorphoApy(); }} disabled={loading} className="p-2 rounded-lg bg-green-800/50 hover:bg-green-700/50">
            <RefreshCw className={`w-4 h-4 text-green-300 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {/* APY pills */}
        <div className="mt-3 flex gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-1.5 border border-white/20">
            <span className="text-[10px] text-white/60 font-bold uppercase">YO Best</span>
            {yoLoading ? <span className="text-xs text-white/40 animate-pulse">...</span>
              : bestYoApy != null ? <span className="text-sm font-black text-yellow-300">{bestYoApy.toFixed(2)}%</span>
              : <span className="text-xs text-white/40">–</span>}
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-1.5 border border-white/20">
            <span className="text-[10px] text-white/60 font-bold uppercase">Morpho USDC</span>
            {morphoUsdcApy != null ? <span className="text-sm font-black text-blue-300">{morphoUsdcApy.toFixed(2)}%</span>
              : <span className="text-xs text-white/40 animate-pulse">...</span>}
          </div>
          {/* Per-vault YO APY pills */}
          {!yoLoading && YO_VAULTS.map(v => {
            const apy = yoApyMap[v.id];
            if (apy == null) return null;
            return (
              <div key={v.id} className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1 border border-white/10">
                <span className="text-[9px] text-white/50 font-bold">{v.emoji}{v.name}</span>
                <span className="text-xs font-black text-yellow-200">{apy.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
        {/* Active positions */}
        {(morphoPositions.some(p => p.assetsValue > 0n) || Object.values(yoSharesBal).some(s => s > 0n)) && (
          <div className="mt-3 pt-3 border-t border-green-700/40">
            <div className="text-[10px] text-green-400 uppercase font-bold mb-1">Active Positions</div>
            <div className="flex gap-3 flex-wrap">
              {MORPHO_VAULTS.map(v => { const p = morphoPositions.find(x => x.vaultId === v.id); if (!p || p.assetsValue === 0n) return null; return <div key={v.id} className="text-xs text-white"><span className="text-green-400 font-bold">{parseFloat(formatUnits(p.assetsValue, v.decimals)).toFixed(4)}</span> {v.asset} <span className="text-white/40 text-[9px]">Morpho</span></div>; })}
              {YO_VAULTS.map(v => { const s = yoSharesBal[v.id] ?? 0n; if (s === 0n) return null; return <div key={v.id} className="text-xs text-white"><span className="text-yellow-300 font-bold">{parseFloat(formatUnits(s, v.decimals)).toFixed(4)}</span> {v.id} <span className="text-white/40 text-[9px]">YO</span></div>; })}
            </div>
          </div>
        )}
      </div>

      {/* ── Wrap / Unwrap ── */}
      {(hasEth || hasWeth) && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-100 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-bold text-emerald-900">Wrap / Unwrap</span>
            <span className="text-[10px] text-emerald-700 ml-auto">ETH ↔ WETH · 1:1</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/60 rounded-xl p-2.5"><div className="text-[10px] text-emerald-700 font-medium mb-0.5">ETH in Vault</div><div className={`text-sm font-bold font-mono ${hasEth ? "text-black" : "text-zinc-400"}`}>{parseFloat(formatUnits(ethBalance, 18)).toFixed(6)}</div></div>
            <div className="bg-white/60 rounded-xl p-2.5"><div className="text-[10px] text-emerald-700 font-medium mb-0.5">WETH in Vault</div><div className={`text-sm font-bold font-mono ${hasWeth ? "text-black" : "text-zinc-400"}`}>{parseFloat(formatUnits(wethBalance, 18)).toFixed(6)}</div></div>
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

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* YO PROTOCOL — 4 VAULTS                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1 flex items-center gap-2">
        <span>🐷 YO Protocol</span>
        <a href="https://app.yo.xyz" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400 underline normal-case font-normal text-[10px]">yo.xyz ↗</a>
      </div>

      <div className="space-y-3">
        {YO_VAULTS.map(v => {
          const apy           = yoApyMap[v.id];
          const underlyingBal = yoUnderlyingBal[v.id] ?? 0n;
          const shares        = yoSharesBal[v.id] ?? 0n;
          const hasUnderlying = underlyingBal > 0n;
          const hasPosition   = shares > 0n;
          const busy          = isBusy(v.id);
          const canSwap       = hasWeth && !v.isWethUnderlying;
          const udDisplay     = parseFloat(formatUnits(underlyingBal, v.decimals)).toFixed(v.decimals === 8 ? 6 : 4);
          const sharesDisplay = parseFloat(formatUnits(shares, v.decimals)).toFixed(v.decimals === 8 ? 6 : 4);
          const principalNum  = parseFloat(formatUnits(shares, v.decimals));
          const dailyYield    = apy != null ? (principalNum * apy) / 100 / 365 : 0;

          return (
            <div key={v.id} className={`rounded-2xl border-2 ${v.borderColor} bg-gradient-to-br ${v.bgColor} p-4 space-y-3`}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-base font-black ${v.textColor}`}>{v.emoji} {v.name}</span>
                  {yoLoading ? <span className="text-[10px] text-zinc-400 animate-pulse">Loading APY...</span>
                    : apy != null ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.badgeColor} flex items-center gap-0.5`}><TrendingUp className="w-2.5 h-2.5" />{apy.toFixed(2)}% APY</span>
                    : null}
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">{v.underlying} savings vault · ERC-4626 · Auto-compounding</p>

              {/* Balances */}
              <div className="flex items-center justify-between text-xs bg-white/60 dark:bg-black/20 rounded-xl px-3 py-2">
                <div className="flex items-center gap-1.5 text-zinc-500"><Wallet className="w-3 h-3" /><span>{v.underlying} in Vault</span></div>
                <span className={`font-bold ${hasUnderlying ? v.textColor : "text-zinc-400"}`}>{udDisplay}</span>
              </div>

              {/* Yield Summary */}
              {hasPosition && (
                <div className={`rounded-xl border ${v.borderColor} bg-white/40 dark:bg-black/20 p-3 space-y-2`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><Sprout className={`w-3.5 h-3.5 ${v.textColor}`} strokeWidth={2.5} /><span className={`text-xs font-bold ${v.textColor}`}>Earning in {v.name}</span></div>
                    <span className={`text-sm font-black ${v.textColor}`}>{sharesDisplay} {v.id}</span>
                  </div>
                  {apy != null && principalNum > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: "Daily",   val: dailyYield < 0.0001 ? dailyYield.toFixed(6) : dailyYield.toFixed(4) },
                        { label: "Monthly", val: (dailyYield * 30) < 0.001 ? (dailyYield * 30).toFixed(5) : (dailyYield * 30).toFixed(3) },
                        { label: "Annual",  val: ((principalNum * apy) / 100).toFixed(v.decimals === 8 ? 6 : 2) },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-white/60 dark:bg-black/20 rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide">{label}</div>
                          <div className="text-xs font-black text-green-600 dark:text-green-400 mt-0.5">+{val} {v.underlying}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {apy != null && <div className="text-[10px] text-center text-zinc-500">at <span className={`font-bold ${v.textColor}`}>{apy.toFixed(2)}% APY</span> · estimates only</div>}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                {canSwap && (
                  <button onClick={() => handleSwapAndSaveToYo(v.id)} disabled={busy}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {swapping === v.id ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-xs">{swapProgress}</span></>
                      : <><Zap className="w-3.5 h-3.5" />Swap WETH → {v.underlying} &amp; Save</>}
                  </button>
                )}
                {hasUnderlying && (
                  <button onClick={() => handleDepositToYo(v.id)} disabled={busy}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 ${v.textColor} bg-white dark:bg-zinc-900 border ${v.borderColor} hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}>
                    {depositing === v.id ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving...</>
                      : <><ArrowRight className="w-3.5 h-3.5" />Save {v.underlying} to {v.id}</>}
                  </button>
                )}
                {hasPosition && (
                  <button onClick={() => handleWithdrawFromYo(v.id)} disabled={busy}
                    className="px-3 py-2.5 rounded-xl font-bold text-sm text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:text-zinc-800 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {withdrawing === v.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Withdraw"}
                  </button>
                )}
              </div>

              {!hasUnderlying && !hasPosition && !canSwap && (
                <p className="text-[10px] text-zinc-500 text-center">
                  {v.isWethUnderlying ? "Sweep dust → WETH, then deposit here." : `Sweep dust → WETH, then swap WETH → ${v.underlying} here.`}
                </p>
              )}

              <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                <span>{v.underlying} · ERC-4626 · Base</span>
                <span className="font-mono opacity-50">{v.vaultAddress.slice(0, 8)}…</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MORPHO BLUE                                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1 pt-2">Morpho Blue Vaults</div>

      <div className="space-y-3">
        {MORPHO_VAULTS.map(vault => {
          const c       = morphoColors[vault.color as keyof typeof morphoColors];
          const apy     = morphoApyData.find(a => a.vaultId === vault.id);
          const pos     = morphoPositions.find(p => p.vaultId === vault.id);
          const rawBal  = morphoBalances[vault.id] || "0";
          const hasBal  = BigInt(rawBal) > 0n;
          const hasPos  = pos && pos.assetsValue > 0n;
          const busy    = isBusy(vault.id);

          return (
            <div key={vault.id} className={`rounded-2xl border ${c.border} ${c.bg} p-4 space-y-3`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${c.text}`}>{vault.name}</span>
                    {apy?.apy != null ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.badge} flex items-center gap-0.5`}><TrendingUp className="w-2.5 h-2.5" />{apy.apy.toFixed(2)}% APY</span>
                      : <span className="text-[10px] text-zinc-500 animate-pulse">APY loading...</span>}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{vault.description}</p>
                </div>
                <a href={vault.morphoUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-zinc-500 hover:text-zinc-300 underline shrink-0">morpho.org ↗</a>
              </div>

              <div className="flex items-center justify-between text-xs bg-white/50 dark:bg-black/20 rounded-xl px-3 py-2">
                <div className="flex items-center gap-1.5 text-zinc-500"><Wallet className="w-3 h-3" /><span>In Smart Vault</span></div>
                <span className={`font-bold ${hasBal ? c.text : "text-zinc-400"}`}>{hasBal ? parseFloat(formatUnits(BigInt(rawBal), vault.decimals)).toFixed(4) : "0"} {vault.asset}</span>
              </div>

              {hasPos && (
                <div className="flex items-center justify-between text-xs bg-green-500/10 rounded-xl px-3 py-2 border border-green-500/20">
                  <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-100"><Sprout className="w-3 h-3" strokeWidth={2.5} /><span>Earning at Morpho</span></div>
                  <span className="font-bold text-zinc-800 dark:text-zinc-100">{parseFloat(formatUnits(pos.assetsValue, vault.decimals)).toFixed(6)} {vault.asset}</span>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {hasEth && <button onClick={() => handleMorphoSwapAndDeposit(vault)} disabled={busy} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{swapping === vault.id ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-xs">{swapProgress}</span></> : <><Zap className="w-3.5 h-3.5" />Swap ETH → {vault.asset} &amp; Deposit</>}</button>}
                {hasBal && <button onClick={() => handleMorphoDeposit(vault)} disabled={busy} className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 ${c.text} bg-white dark:bg-zinc-900 border ${c.border} hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}>{depositing === vault.id ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Depositing...</> : <><ArrowRight className="w-3.5 h-3.5" />Deposit {vault.asset}</>}</button>}
                {hasPos && <button onClick={() => handleMorphoWithdraw(vault)} disabled={busy} className="px-3 py-2.5 rounded-xl font-bold text-sm text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-700 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{withdrawing === vault.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Withdraw"}</button>}
              </div>
              {!hasBal && !hasPos && !hasEth && <p className="text-[10px] text-zinc-500 text-center">Sweep dust to WETH first, then come back.</p>}
            </div>
          );
        })}
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-1.5">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">How it works</p>
        <div className="space-y-1 text-xs text-zinc-500">
          <div className="flex gap-2"><span className="text-yellow-500 shrink-0">1.</span><span>Sweep dust tokens → WETH in the Sweep tab</span></div>
          <div className="flex gap-2"><span className="text-yellow-500 shrink-0">2.</span><span>Save to YO: <strong>yoUSD</strong> (USDC), <strong>yoETH</strong> (WETH direct), <strong>yoBTC</strong> (cbBTC), <strong>yoEUR</strong> (EURC) — swap via LI.FI</span></div>
          <div className="flex gap-2"><span className="text-yellow-500 shrink-0">3.</span><span>Or deposit to <strong>Morpho Blue</strong> — yield accumulates automatically</span></div>
          <div className="flex gap-2"><span className="text-yellow-500 shrink-0">4.</span><span>Withdraw to vault anytime · All positions shown in header</span></div>
        </div>
        <p className="text-[9px] text-zinc-600 pt-1">YO Protocol · Morpho Blue · Swap via LI.FI · Non-custodial · Smart contract risk applies</p>
      </div>
    </div>
  );
};