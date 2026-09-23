FROM python:3.12-slim

WORKDIR /app

# Install dependencies first so code changes do not invalidate the layer.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1 \
    ML_PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
