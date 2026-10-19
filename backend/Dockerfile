# ── Render / Web Service Dockerfile ──────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy & install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY create_tables.py ./
COPY scripts ./scripts

EXPOSE 10000

# Start Uvicorn bound to 0.0.0.0 and $PORT (Render sets PORT environment variable)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
