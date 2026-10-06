# ClawDex agent rules

## Source of truth
- docs/SPEC.md (product), docs/BLUEPRINT.md (original blueprint), docs/ARCHITECTURE.md and docs/WORKSTREAMS.md (once approved). Read them before any task.
- Decisions live in docs/DECISIONS.md. Do not contradict them.

## Product
- ClawDex is a Solana-only AI intelligence terminal. It explains tokens; it does not trade.
- Free first. No payments at launch. No dependency on DexScreener. Helius is the data source.
- Mobile-first, plain-English UI.

## Stack is fixed
- pnpm workspaces + Turborepo. Do not switch package manager, build tool or framework. Node 20+.
- apps/frontend: Next.js (App Router), Tailwind, shadcn-style components.
- apps/backend: NestJS, a persistent process (webhooks, schedulers, ingestion). Not serverless.
- packages/shared: Prisma (Postgres) schema and client, score formula, shared types. This is the contract between developers.
- Do not add new frameworks, ORMs, databases or monorepo tools without asking.

## Trade execution is PAUSED
- Do not implement, enable or extend trade execution. TradeService stays as is: it may log decisions and must never sign or send transactions.
- Do not add wallet custody, private-key handling or signing code.
- Do not delete TradeService. Leave it untouched unless the task says otherwise.

## Turborepo
- Run tasks through root scripts (pnpm build, pnpm lint, pnpm dev) or pnpm --filter <package> <script>.
- Package names: frontend, backend, @clawdex/shared. Cross-package deps use workspace:* only.
- After any schema change: pnpm --filter @clawdex/shared db:generate.
- Definition of done: pnpm build and pnpm lint pass. Backend changes also need pnpm --filter backend test.

## Working rules
- Only edit files in the folders owned by the current task (see docs/WORKSTREAMS.md).
- Do not edit packages/shared without saying so.
- Never commit secrets. Use .env.example files only.
- Verify third-party APIs against their docs. Do not guess endpoints.
- After each task, summarize what changed and which contracts were touched.
