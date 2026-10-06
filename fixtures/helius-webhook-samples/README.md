# Helius webhook samples

Real captured payloads land here when `DEBUG_SAVE_WEBHOOK_PAYLOADS=true` is set on the backend (see `apps/backend/src/launch-detection/launch-ingest.service.ts`). Use them to validate/fix `LaunchIngestService.extractNewMint()` and `mapSourceToLaunchpad()` — those are currently best-effort heuristics against Helius's generally-documented enhanced-transaction shape, not verified against a real pump.fun/LaunchLab create event.

## Registering the webhook

Easiest and least error-prone: use the Helius dashboard (app.helius.dev → Webhooks) — it gives you dropdowns for `webhookType`/`transactionTypes` instead of needing to guess exact enum values.

If registering via the API directly, the shape is (field names confirmed from Helius docs, exact enum values for `transactionTypes` NOT verified — check the dashboard or current docs before trusting this verbatim):

```bash
curl -X POST "https://api.helius.xyz/v0/webhooks?api-key=$HELIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookURL": "https://<your-backend-host>/webhooks/helius",
    "transactionTypes": ["ANY"],
    "accountAddresses": [
      "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"
    ],
    "webhookType": "enhanced",
    "authHeader": "<same value as HELIUS_WEBHOOK_SECRET in the backend .env>",
    "txnStatus": "success"
  }'
```

`accountAddresses` are the pump.fun and Raydium LaunchLab program IDs (`packages/shared/src/chain/programIds.ts` — verified 2026-09-20). ClawPump is intentionally not in this list; it's not a separate on-chain program, see the comment in `programIds.ts` and `clawpump-poller.service.ts`.

## Once you have real samples

1. Set `DEBUG_SAVE_WEBHOOK_PAYLOADS=true`, let a few real transactions land here.
2. Open one, check whether `tokenTransfers[0].mint` / `accountData[].tokenBalanceChanges[0].mint` actually holds the new mint for a real "create" event, and whether `source` is really `"PUMP_FUN"` for pump.fun txs.
3. Fix `LaunchIngestService` to match reality, then turn `DEBUG_SAVE_WEBHOOK_PAYLOADS` back off.
