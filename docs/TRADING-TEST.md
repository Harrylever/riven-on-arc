# Trading: one small real-money test

Trading is off by default (`NEXT_PUBLIC_TRADING_ENABLED`). Riven only builds unsigned transactions; your wallet signs and sends them. Run this once on Arc mainnet before turning it on for anyone else. Plan for about $3 in total.

## What the server already checks before offering a trade

Every quote goes through `lib/trade-guards.ts`. A trade is refused (no transaction is built) when:

- it is larger than `TRADE_MAX_USDC` (default **$250**);
- the estimated price impact is over **30%**;
- the pool charges a swap fee of **25% or more**;
- for buys, the quoted tokens cannot be sold straight back (no sell-back quote), or a sell-back would lose over **60%**.

It warns, and the sheet then needs a tick before the button works, when:

- price impact is over **5%**;
- the pool fee is over **5%**;
- a sell-back would lose clearly more than the pool fee and impact explain.

It routes through whichever of the token's USDC pools pays the most (each fee tier and hook is its own pool). **What it cannot see:** a transfer tax or blacklist inside the token's own code. Those show up as contract flags in the score, not in a pool quote.

Other protections that were already there: approvals are for the exact amount and expire in 30 minutes, the wallet refuses to sign calls to anything except the Uniswap router, Permit2 and ERC-20 approve/transfer, and the swap has a 20-minute deadline and a minimum-out from your slippage setting.

## Before you start

1. Use a **fresh wallet** holding only the test funds: about **3 USDC** on Arc (USDC is also the gas token, so keep at least 0.1 spare).
2. Pick a token whose pool has real liquidity. On its page, "USDC in pool" should be a believable number and the exit check should show a small loss for $1. Avoid flagged tokens.
3. Run the app locally with trading on:
   ```
   NEXT_PUBLIC_TRADING_ENABLED="true"     # apps/frontend/.env.local
   TRADE_MAX_USDC=5                        # optional: tighten the cap for the test
   ```
   Use a good RPC (`ARC_RPC_URL`). The public one is sometimes slow, which makes quoting slow.

## The test

| Step | Do | Expect |
|---|---|---|
| 1 | Connect the fresh wallet. | The sheet shows your USDC balance. |
| 2 | Open the token, tap Buy, enter **1** USDC, slippage 3%. | A quote appears with "You get about…", a minimum, and an estimated price impact. Any warning needs ticking. |
| 3 | Compare "You get about" with the exit check and the token's price. | They agree within the fee and impact. If not, stop. |
| 4 | Confirm. The wallet asks for **two approvals** the first time (token to Permit2, then Permit2 to the router), then the swap. | Each approval shows the exact amount, not "unlimited". Read each prompt before signing. |
| 5 | Check the explorer link for each transaction. | All three succeed. Tokens arrive in your wallet. |
| 6 | Sell **half** of what you bought back through the same sheet. | Proceeds are close to the quote, minus fees. |
| 7 | Sell the rest. | The wallet ends with only dust of the token. |
| 8 | Revoke leftovers (see below). | No allowance remains. |

## If something goes wrong

- **Quote says "No quote":** the pool has no liquidity at the current price. Try another token.
- **"Not offering the buy":** the guards found a sell-back problem or a huge fee. That is the check working. Do not try to bypass it.
- **A swap reverts:** the wallet shows a failed transaction and the funds stay put. Note the transaction hash and the token, and do not retry with a bigger amount.
- **The amount received is far below the quote:** stop trading, and keep the transaction hashes.

## Revoking approvals

Approvals are exact-amount and expire after 30 minutes, so little is left over. To be thorough, open the explorer's token-approvals page for the wallet and revoke any remaining allowance for the token and for Permit2.

## Turning it on for everyone

Only after steps 1 to 8 pass cleanly: set `NEXT_PUBLIC_TRADING_ENABLED="true"` in the deployment, keep `TRADE_MAX_USDC` low (for example 50), and keep "not financial advice" visible. Record the transaction hashes of your test in the submission notes.
