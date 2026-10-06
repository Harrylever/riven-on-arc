# backend

Hono API + cron jobs, run directly by Bun (no build step).

```bash
bun run dev      # watch mode
bun run start    # production
bun test
```

- `src/app.ts` — routes: `GET /`, `GET /health`, `POST /webhooks/helius`
- `src/jobs.ts` — all 10 cron schedules (croner)
- `src/container.ts` — manual service wiring
- Requires `packages/shared` to be built first: `bun run build:shared` from the repo root.
