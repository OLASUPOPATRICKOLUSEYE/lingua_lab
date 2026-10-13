from __future__ import annotations

from fastapi import FastAPI, HTTPException

from .config import get_settings
from .schemas import GradingRequest, GradingResponse
from .service import AiGradingService, ServiceUnavailableError, SpeechNotDetectedError


settings = get_settings()
service = AiGradingService(settings)

app = FastAPI(title="LinguaLab AI Service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return service.health()


@app.post("/grade", response_model=GradingResponse)
def grade(payload: GradingRequest) -> GradingResponse:
    try:
        return service.grade(payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SpeechNotDetectedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ServiceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
