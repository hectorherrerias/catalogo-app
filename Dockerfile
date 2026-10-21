FROM python:3.12-slim

# Evitar generación de .pyc y forzar buffering inmediato de logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATABASE_PATH=/app/data/catalog.db

WORKDIR /app

# Instalar dependencias (capa cacheada mientras no cambie requirements.txt)
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copiar código de la aplicación
COPY app/ ./app/

# Base de datos SQLite y fotos subidas viven en el volumen /app/data
RUN mkdir -p /app/data/uploads
VOLUME ["/app/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
