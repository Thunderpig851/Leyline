import base64
import io
import os
import traceback
from typing import Tuple

import numpy as np
from flask import Flask, jsonify, request
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from paddleocr import TextRecognition

app = Flask(__name__)

MODEL_NAME = os.environ.get("PADDLEOCR_MODEL_NAME", "en_PP-OCRv5_mobile_rec")
CPU_THREADS = int(os.environ.get("PADDLEOCR_CPU_THREADS", "6"))
MODEL = None


def get_model() -> TextRecognition:
    global MODEL

    if MODEL is None:
        MODEL = TextRecognition(
            model_name=MODEL_NAME,
            device=os.environ.get("PADDLEOCR_DEVICE", "cpu"),
            cpu_threads=CPU_THREADS,
            enable_mkldnn=True,
        )

    return MODEL


def parse_data_url(data_url: str) -> Image.Image:
    if not data_url or "," not in data_url:
        raise ValueError("Invalid image payload.")

    _, encoded = data_url.split(",", 1)
    image_bytes = base64.b64decode(encoded)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return image


def preprocess_band(image: Image.Image, scale: int = 4) -> np.ndarray:
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray, cutoff=1)
    gray = ImageEnhance.Contrast(gray).enhance(1.95)
    gray = ImageEnhance.Brightness(gray).enhance(1.04)
    gray = ImageEnhance.Sharpness(gray).enhance(2.8)

    target_width = max(gray.width * scale, 960)
    target_height = max(gray.height * scale, 120)
    gray = gray.resize((target_width, target_height), Image.Resampling.LANCZOS)
    gray = gray.filter(ImageFilter.MedianFilter(size=3))

    rgb = gray.convert("RGB")
    return np.ascontiguousarray(np.array(rgb, dtype=np.uint8))


def extract_prediction_fields(prediction) -> Tuple[str, float]:
    payload = getattr(prediction, "json", prediction)
    if callable(payload):
        payload = payload()

    if isinstance(payload, dict):
        payload = payload.get("res", payload)
        text = str(payload.get("rec_text") or "").strip()
        score = float(payload.get("rec_score") or 0.0)
        return text, score

    if isinstance(payload, list):
        for item in payload:
            text, score = extract_prediction_fields(item)
            if text:
                return text, score

    return "", 0.0


def recognize_best(image: Image.Image, scale: int = 4) -> Tuple[str, float]:
    model = get_model()
    candidates = []

    for rotated in (image, image.rotate(180, expand=True)):
        prepared = preprocess_band(rotated, scale=scale)
        results = model.predict(input=[prepared], batch_size=1)

        for prediction in results:
            text, score = extract_prediction_fields(prediction)
            if text:
                candidates.append((text, score))

    candidates.sort(key=lambda item: item[1], reverse=True)
    return candidates[0] if candidates else ("", 0.0)


@app.get("/health")
def health():
    return jsonify({"ok": True, "model": MODEL_NAME})


@app.post("/identify")
def identify():
    try:
        payload = request.get_json(silent=True) or {}
        title_raw = str(payload.get("titleBandDataUrl") or "")
        type_raw = str(payload.get("typeBandDataUrl") or "")

        print("[OCR] payload keys:", list(payload.keys()), flush=True)
        print("[OCR] title len:", len(title_raw), "type len:", len(type_raw), flush=True)

        if not title_raw or not type_raw:
            return jsonify({
                "ok": False,
                "error": "Missing titleBandDataUrl or typeBandDataUrl",
            }), 400

        if "," not in title_raw or "," not in type_raw:
            return jsonify({
                "ok": False,
                "error": "Band image payload is not a valid data URL",
            }), 400

        title_band = parse_data_url(title_raw)
        type_band = parse_data_url(type_raw)

        print("[OCR] title size:", title_band.size, "type size:", type_band.size, flush=True)

        title_text, title_confidence = recognize_best(title_band, scale=4)
        type_text, type_confidence = recognize_best(type_band, scale=4)

        return jsonify({
            "ok": True,
            "title": {
                "text": title_text,
                "confidence": title_confidence,
            },
            "typeLine": {
                "text": type_text,
                "confidence": type_confidence,
            },
            "signalsSummary": f"PaddleOCR • name: {title_text or '—'} • type: {type_text or '—'}",
        })
    except Exception as error:
        print("[OCR] identify failed:", repr(error), flush=True)
        traceback.print_exc()
        return jsonify({
            "ok": False,
            "error": str(error),
            "errorType": type(error).__name__,
        }), 400


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
