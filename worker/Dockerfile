# Packages the worker so it runs identically on your laptop, in CI, on Hugging Face Spaces or any cloud.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as a non-root user
RUN useradd -m appuser
USER appuser

EXPOSE 7860
# Hosts such as Render/Cloud Run inject $PORT; Hugging Face uses 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
