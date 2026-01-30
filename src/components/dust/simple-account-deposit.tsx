"use client";

import { useState } from "react";
import { useSendTransaction, useAccount, useBalance } from "wagmi";
// [FIX] Tambahkan import formatEther
import { parseEther, formatEther } from "viem"; 
import { Download, WarningTriangle } from "iconoir-react";
import { SimpleToast } from "~/components/ui/simple-toast";

export const SimpleAccountDeposit = ({ 
    vaultAddress, 
    isDeployed, 
    onUpdate 
}: { 
    vaultAddress: string | null, 
    isDeployed: boolean, 
    onUpdate: () => void 
}) => {
    const { address } = useAccount();
    const { data: balance } = useBalance({ address });
    const { sendTransactionAsync } = useSendTransaction();
    
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: "success"|"error" } | null>(null);

    const handleDeposit = async () => {
        if (!amount || !vaultAddress) return;
        setLoading(true);
        try {
            const hash = await sendTransactionAsync({
                to: vaultAddress as `0x${string}`,
                value: parseEther(amount),
            });
            console.log("Deposit Hash:", hash);
            setToast({ msg: "Deposit Sent! Waiting for confirmation...", type: "success" });
            setAmount("");
            
            setTimeout(() => {
                onUpdate();
                setLoading(false);
            }, 5000);
            
        } catch (e: any) {
            console.error(e);
            setToast({ msg: "Failed: " + (e.shortMessage || e.message), type: "error" });
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm mb-6">
            <SimpleToast message={toast?.msg || null} type={toast?.type} onClose={() => setToast(null)} />
            
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                <Download className="w-4 h-4 text-green-600"/> 
                Deposit ETH from Wallet
            </h3>

            {!isDeployed && (
                <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 p-3 rounded-xl flex gap-3 items-start">
                    <WarningTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
                    <div className="text-xs text-yellow-700 dark:text-yellow-500">
                        <strong>Vault Inactive.</strong><br/>
                        Your first deposit will automatically deploy and activate your Smart Vault.
                    </div>
                </div>
            )}

            <div className="flex gap-2 mb-2">
                <input 
                    type="number" 
                    placeholder="0.01" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 font-mono text-lg outline-none focus:ring-2 ring-blue-500/20"
                />
                <button 
                    onClick={handleDeposit}
                    disabled={loading || !amount}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-xl font-bold transition-all"
                >
                    {loading ? "..." : "Send"}
                </button>
            </div>
            <div className="text-right text-xs text-zinc-400">
                {/* [FIX] Gunakan formatEther(balance.value) menggantikan balance.formatted */}
                Wallet Balance: {balance ? parseFloat(formatEther(balance.value)).toFixed(4) : "0"} ETH
            </div>
        </div>
    );
};