<h2 align="center">Nyawit</h2>



![License](https://img.shields.io/badge/License-MIT-green)
[![Follow on X](https://img.shields.io/twitter/follow/adhichronique?style=social)](https://x.com/adhichronique)


---











```bash


                                  Owner   ──sign──▶  vault.executeBatch()
                                                               │
                                                  ┌────────────▼─────────────┐
                                                  │   Smart Account (Vault)  │
                                                  │  msg.sender = vault ✓    │
                                                  │                          │
                                                  │  approve(router, max)    │
                                                  │  swap(token→WETH)        │
                                                  └──────────────────────────┘
                                                               │
                                                  ┌────────────▼─────────────┐
                                                  │      DEX (LI.FI)         │
                                                  │                          |
                                                  │    fromAddress = vault ✓ |
                                                  │        taker = vault ✓   |
                                                  └──────────────────────────┘
                                                               │
                                                               │
                                                  ┌────────────▼─────────────┐
                                                  │     Withdraw to Owner    │
                                                  │                          │
                                                  └──────────────────────────┘


                          



```


# 🌾 Nyawit — Dust Sweeper × YO Protocol

> **Sweep your dust tokens into yield — powered by YO Protocol & Morpho on Base**

[![Live App](https://img.shields.io/badge/Live%20App-nyawit--nih--orang.vercel.app-blue?style=flat-square)](https://nyawit-nih-orang.vercel.app)
[![Base](https://img.shields.io/badge/Network-Base-0052FF?style=flat-square)](https://base.org)
[![YO Protocol](https://img.shields.io/badge/Yield-YO%20Protocol-yellow?style=flat-square)](https://yo.xyz)
[![Farcaster](https://img.shields.io/badge/MiniApp-Farcaster-8A2BE2?style=flat-square)](https://farcaster.xyz)

---

## The Problem

Every DeFi wallet accumulates **dust** — tiny token balances worth less than $3 each, too small to swap individually (gas costs more than the token). These tokens just sit idle, doing nothing.

## The Solution

Nyawit is a **4-step pipeline** that turns worthless dust into productive yield:

```
Dust Tokens → Sweep to WETH → Choose Protocol → Earn Yield
```

1. **Scan** — detect all dust tokens in your wallet
2. **Sweep** — batch swap up to 5 tokens → WETH in a single transaction
3. **Earn** — choose between **YO Protocol (yoUSD)** or **Morpho Blue** for yield
4. **Vault** — manage positions, withdraw anytime

---

## YO Protocol Integration

Nyawit integrates **YO Protocol's yoUSD vault** directly into the savings flow:

| Feature | Detail |
|---|---|
| Vault | yoUSD (`0x0000000f2eb9f69274678c76222b35eec7588a65`) |
| Underlying | USDC on Base |
| Standard | ERC-4626 |
| SDK | `@yo-protocol/core` + `@yo-protocol/react` |

### Flow: Dust → yoUSD

```
Dust tokens (any ERC-20)
  └─ Batch swap → WETH (via LI.FI aggregator, 1 tx)
       └─ Swap WETH → USDC (via LI.FI)
            └─ Approve USDC → yoUSD vault
                 └─ ERC4626.deposit() → yoUSD shares
                      └─ 📊 Yield Summary: daily / monthly / annual projections
```

### What users see after depositing to YO

```
┌─────────────────────────────────────┐
│ 🌱 Earning at YO          $12.54   │
│ ┌─────────┬──────────┬───────────┐  │
│ │  Daily  │ Monthly  │  Annual   │  │
│ │ +$0.003 │  +$0.11  │  +$1.25  │  │
│ └─────────┴──────────┴───────────┘  │
│     at 9.98% APY · estimates only   │
└─────────────────────────────────────┘
```

### APY Comparison

The Earn tab shows **live APY** for both protocols side by side, fetched from YO Protocol's SDK and Morpho's GraphQL API, so users can always pick the best rate.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 + Tailwind CSS |
| Wallet | wagmi v2 + RainbowKit + Farcaster MiniApp SDK |
| Smart Account | LightAccount v2 (ERC-4337) via Coinbase CDP |
| Yield — YO | `@yo-protocol/core` + `@yo-protocol/react` |
| Yield — Morpho | Morpho Blue ERC-4626 vaults (Gauntlet curated) |
| Swap | LI.FI aggregator (0x / KyberSwap fallback) |
| Prices | DexScreener + GeckoTerminal |
| Token data | Alchemy SDK |
| Deploy | Vercel |
| Network | Base Mainnet |

---

## Smart Account Architecture

Nyawit uses a **LightAccount v2** smart contract wallet as the user's vault. This enables:

- **Gasless operations** — Coinbase CDP Paymaster sponsors wrap/deposit/withdraw
- **Batch swaps** — swap up to 5 dust tokens in a single UserOp
- **SC wallet support** — detects Coinbase Smart Wallet / Farcaster wallet and routes via `vault.execute()` directly (bypasses ERC-4337 for EOA-incompatible signers)

```
EOA wallet    → getSmartAccountClient  → CDP Paymaster (sponsored) ✅
SC wallet     → getDirectVaultClient   → vault.execute() as owner  ✅
```

---

## Key Contracts (Base Mainnet)

| Contract | Address |
|---|---|
| yoUSD Vault | `0x0000000f2eb9f69274678c76222b35eec7588a65` |
| LightAccount v2 Factory | `0x0000000000400CdFef5E2714E63d8040b700BC24` |
| Morpho Gauntlet USDC | `0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12` |
| Morpho Gauntlet WETH | `0x6b13c060F13Af1fdB319F52315BbbF3fb1D88844` |
| USDC (Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH (Base) | `0x4200000000000000000000000000000000000006` |

---

## Running Locally

```bash
git clone https://github.com/Chronique/nyawit-nih-orang
cd nyawit-nih-orang
npm install

# Create .env.local
cp .env.example .env.local
# Fill in: NEXT_PUBLIC_ALCHEMY_API_KEY, NEXT_PUBLIC_CDP_API_KEY,
#          NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, NEXT_PUBLIC_LIFI_API_KEY, ZEROX_API_KEY

npm run dev
```

---

## Hackathon: Hack with YO

This project was built for **[Hack with YO: Designing Smart DeFi Savings](https://dorahacks.io/hackathon/yo/detail)** on DoraHacks.

**Why Nyawit fits the hackathon theme:**
- Turns idle dust into a consumer savings experience
- YO Protocol is the primary yield destination, presented to users as "Save to YO"
- Live APY comparison encourages users to choose YO when rates are competitive
- Yield Summary card makes abstract APY tangible: "you earn $0.003 today"
- Works as a Farcaster MiniApp — consumer-friendly distribution channel

---

## Links

- **Live App:** https://nyawit-nih-orang.vercel.app
- **YO Protocol:** https://yo.xyz
- **Base:** https://base.org
- **Morpho:** https://morpho.org

                    



---
## 📄 License
This project is licensed under the MIT License - see the LICENSE
 file for details.
