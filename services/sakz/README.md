# sakz — Riven's perp-signal scanner

The scanning half of sakz-bot, run headless. It scans Bybit, MEXC and Binance perpetuals every 10 minutes, scores each setup, tracks how past calls ended (target hit, stopped out, expired), retrains a win-probability model on those results, and mirrors the calls into Riven's `perp_signals` table. **It only produces signals; it never places an order.**

What was brought over from sakz-bot: the 21 modules the scanner imports (`sakz_engine_scan`, `sakz_engine_outcomes`, `sakz_scanner`, the exchange adapters, the SQLite layer, the model trainers, `riven_sync`) and the tests that cover them. The Telegram bot, charts, trading handlers and the `_recovery` copies stayed behind in the original folder.

## Run locally (uv)

The project is managed with [uv](https://docs.astral.sh/uv/): `pyproject.toml` lists the dependencies, `uv.lock` pins them, and Python 3.11 is pinned in `.python-version`. uv downloads the right Python and builds `.venv` for you.

```bash
cd services/sakz
uv sync                                          # create .venv with the locked dependencies
echo 'RIVEN_DATABASE_URL=postgresql://...' > .env   # required (or export it in your shell)
uv run python headless.py --once                 # one scan + outcome pass
uv run python headless.py                        # every 10 minutes, forever
uv run python headless.py --backfill             # import an existing sakz_data.db once
uv run pytest                                    # tests
uv add <package>                                 # add a dependency (updates pyproject.toml + uv.lock)
```

On a Mac, xgboost also needs OpenMP: `brew install libomp`.

| Variable | Default | Meaning |
|---|---|---|
| `RIVEN_DATABASE_URL` | none | Riven's Postgres. Required. |
| `SAKZ_DB_PATH` | `./sakz_data.db` | sakz-bot's SQLite history |
| `SAKZ_DATA_DIR` | `.` | where trained models (`*.pkl`) are saved |
| `SAKZ_SCAN_INTERVAL_S` | `600` | seconds between scans |

The Docker image installs from `uv.lock` on Python 3.11 (as sakz-bot's own `runtime.txt`). Run only one scanner at a time against a database. Deployment: `docs/DEPLOY.md`.
