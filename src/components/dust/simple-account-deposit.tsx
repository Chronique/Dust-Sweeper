"use client";

import { useState } from "react";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { parseEther, encodeFunctionData, encodeAbiParameters, parseAbiParameters, getAddress, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { publicClient } from "~/lib/coinbase-smart-account"; 
import { SimpleToast } from "~/components/ui/simple-toast";
import { Flash, Wallet, Copy } from "iconoir-react";

// FACTORY CONFIG (V1.1)
const CB_SW_FACTORY = "0xBA5ED110eFDBa3D005bfC882d75358ACBbB85842";
const FACTORY_ABI = [{
  inputs: [{ internalType: "bytes[]", name: "owners", type: "bytes[]" }, { internalType: "uint256", name: "nonce", type: "uint256" }],
  name: "createAccount",
  outputs: [{ internalType: "address", name: "account", type: "address" }],
  stateMutability: "payable", type: "function"
}] as const;

export const SimpleAccountDeposit = ({ vaultAddress, isDeployed, onUpdate }: { vaultAddress: string | null, isDeployed: boolean, onUpdate: () => void }) => {
  const { address: owner, chainId } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [toast, setToast] = useState<{msg:string, type:"success"|"error"}|null>(null);

  // A. DEPLOY VAULT (Pake EOA, Bayar Gas Sendiri)
  const handleDeploy = async () => {
    if (!owner) return;
    setLoading(true);
    try {
      if (chainId !== baseSepolia.id) await switchChainAsync({ chainId: baseSepolia.id });
      
      const encodedOwner = encodeAbiParameters(parseAbiParameters('address'), [owner]);
      const hash = await sendTransactionAsync({
        to: getAddress(CB_SW_FACTORY),
        data: encodeFunctionData({ abi: FACTORY_ABI, functionName: "createAccount", args: [[encodedOwner], 0n] }),
        chainId: baseSepolia.id
      });
      
      await publicClient.waitForTransactionReceipt({ hash });
      setToast({ msg: "Vault Deployed! 🎉", type: "success" });
      onUpdate();
    } catch (e: any) {
      setToast({ msg: "Deploy Failed: " + (e.shortMessage || e.message), type: "error" });
    } finally { setLoading(false); }
  };

  // B. DEPOSIT (Transfer Biasa dari EOA ke Vault)
  const handleDeposit = async () => {
    if (!vaultAddress || !amount) return;
    setLoading(true);
    try {
      if (chainId !== baseSepolia.id) await switchChainAsync({ chainId: baseSepolia.id });
      await sendTransactionAsync({
        to: vaultAddress as Address,
        value: parseEther(amount),
        chainId: baseSepolia.id
      });
      setToast({ msg: "Deposit Success! 💰", type: "success" });
      setAmount("");
      onUpdate();
    } catch (e: any) {
      setToast({ msg: "Deposit Failed", type: "error" });
    } finally { setLoading(false); }
  };

  return (
    <div className="p-5 bg-zinc-900 text-white rounded-2xl shadow-lg relative overflow-hidden mb-4">
      <SimpleToast message={toast?.msg ?? null} type={toast?.type ?? undefined} onClose={() => setToast(null)} />
      
      <div className="flex justify-between items-start mb-2">
         <div className="text-xs text-zinc-400 flex items-center gap-2"><Wallet className="w-4 h-4"/> 1. Simple Account (Owner)</div>
         {!isDeployed && <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-[10px] rounded border border-yellow-500/50">Vault Inactive</span>}
      </div>
      
      <div className="flex items-center gap-2 mb-4">
         <code className="text-sm font-mono opacity-80">{vaultAddress || "Calculating..."}</code>
         <button onClick={() => vaultAddress && navigator.clipboard.writeText(vaultAddress)}><Copy className="w-4 h-4 hover:text-blue-400"/></button>
      </div>

      {!isDeployed ? (
        <button onClick={handleDeploy} disabled={loading} className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl flex items-center justify-center gap-2">
           {loading ? "Deploying..." : <><Flash className="w-4 h-4 fill-current"/> Activate Vault (Pay Gas)</>}
        </button>
      ) : (
        <div className="flex gap-2">
           <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.01 ETH" className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"/>
           <button onClick={handleDeposit} disabled={loading} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-bold text-sm">Deposit</button>
        </div>
      )}
    </div>
  );
};