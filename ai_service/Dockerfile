FROM python:3.11-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ai_service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY ai_service /app/ai_service

EXPOSE 8000
CMD ["uvicorn", "ai_service.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
