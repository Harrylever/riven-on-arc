# Riven perp-signal scanner (sakz-bot's engine, headless).
#   docker build -t riven-sakz services/sakz
FROM python:3.11-slim

# xgboost's Linux wheel needs the GNU OpenMP runtime, which the slim image doesn't ship.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH" \
    SAKZ_DB_PATH=/data/sakz_data.db \
    SAKZ_DATA_DIR=/data

WORKDIR /app
# Dependencies first (cached until pyproject.toml / uv.lock change); --frozen = exactly what uv.lock says.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN mkdir -p /data

# RIVEN_DATABASE_URL (Riven's Postgres) must be set; /data should be a persistent volume.
CMD ["python", "headless.py"]
