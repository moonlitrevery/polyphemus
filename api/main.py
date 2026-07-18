"""FastAPI service for Polyphemus — deployable on Hugging Face Spaces."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from polyphemus.pipeline import PipelineConfig, run_pipeline

app = FastAPI(
    title="Polyphemus",
    description=(
        "Word counter for SAE Brasil AeroDesign technical reports. "
        "Faithful port of PyAeroCounter counting rules."
    ),
    version="1.0.0",
)

# Allow Vercel frontends (and local dev). Override via CORS_ORIGINS env.
_cors = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,https://*.vercel.app",
)
_origins = [o.strip() for o in _cors.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _cors.strip() == "*" else _origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {
        "service": "polyphemus",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "count": "POST /count",
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/count")
async def count_pdf(
    file: UploadFile = File(..., description="PDF technical report"),
    ocr: bool = Form(True, description="Run OCR on extracted figures"),
    include_lists: bool = Form(
        False, description="Include counted/non-counted token lists in response"
    ),
) -> JSONResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a .pdf file")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    with tempfile.TemporaryDirectory(prefix="polyphemus_") as tmp:
        tmp_path = Path(tmp)
        pdf_path = tmp_path / "input.pdf"
        pdf_path.write_bytes(data)

        cfg = PipelineConfig(
            pdffile=str(pdf_path),
            logfile=str(tmp_path / "logfile.txt"),
            wordsfile=str(tmp_path / "wordsfile.txt"),
            nonwordsfile=str(tmp_path / "nonwordsfile.txt"),
            images_folder=str(tmp_path / "PDFFILE"),
            extract=ocr,
            strings_figures=str(tmp_path / "file_strings_from_images.txt"),
            mathmodewords=str(tmp_path / "mathmodewords.txt"),
            write_outputs=True,
        )
        try:
            result = run_pipeline(cfg)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        payload = result.to_dict(include_lists=include_lists)
        return JSONResponse(content=payload)


# Hugging Face Spaces / Docker entry convenience
def create_app() -> FastAPI:
    return app
