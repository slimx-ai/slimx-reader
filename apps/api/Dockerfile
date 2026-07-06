FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    READER_DATA_DIR=/data

# Install deps first (pyproject) for better layer caching, then the app.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir . \
    && useradd --create-home --uid 1000 reader \
    && mkdir -p /data && chown reader:reader /data

USER reader
VOLUME ["/data"]
EXPOSE 8200
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]
