FROM python:3.12-slim

WORKDIR /app

# The API layer builds small by default. Building with the model turned on pulls
# torch and the Qwen weights, which makes for a very large image — do that only
# where speech is actually generated:
#   docker build --build-arg WITH_MODEL=true -f services/tts-service/Dockerfile .
ARG WITH_MODEL=false

COPY requirements.txt requirements-model.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    if [ "$WITH_MODEL" = "true" ]; then pip install --no-cache-dir -r requirements-model.txt; fi

COPY app ./app
COPY scripts ./scripts

# The reference voice is never baked into an image. Mount it at run time:
#   -v $(pwd)/services/tts-service/voices:/app/voices:ro
ENV PYTHONUNBUFFERED=1 \
    TTS_PORT=8100 \
    TTS_REFERENCE_AUDIO=/app/voices/my_voice.wav \
    TTS_REFERENCE_TEXT=/app/voices/my_voice.txt \
    TTS_OUTPUT_DIR=/app/generated \
    TTS_STATIC_OUTPUT_DIR=/app/static_audio

EXPOSE 8100

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8100/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
