#!/usr/bin/env python3
"""
KRX Cartoon Studio — local Chatterbox Multilingual TTS worker.

Protocol: one JSON object per stdin line → one JSON response per stdout line.
Model stays in memory between generate calls until unload.
No network calls after models are cached by huggingface_hub.
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

# Force UTF-8 for Windows pipes
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ENGINE_ROOT = Path(__file__).resolve().parent
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

# Official Chatterbox Multilingual generate() parameters (see mtl_tts.py).
# Emotion presets only tune exaggeration / cfg_weight — no invented knobs.
EMOTION_PRESETS: dict[str, dict[str, float]] = {
    "neutral": {"exaggeration": 0.5, "cfg_weight": 0.5},
    "happy": {"exaggeration": 0.65, "cfg_weight": 0.35},
    "excited": {"exaggeration": 0.75, "cfg_weight": 0.3},
    "angry": {"exaggeration": 0.75, "cfg_weight": 0.3},
    "sad": {"exaggeration": 0.4, "cfg_weight": 0.5},
    "scared": {"exaggeration": 0.7, "cfg_weight": 0.35},
    "whisper": {"exaggeration": 0.35, "cfg_weight": 0.55},
    "shout": {"exaggeration": 0.85, "cfg_weight": 0.25},
    "surprised": {"exaggeration": 0.7, "cfg_weight": 0.35},
    "evil": {"exaggeration": 0.8, "cfg_weight": 0.3},
}

SUPPORTED_LANGUAGES = {
    "ar": "Arabic",
    "da": "Danish",
    "de": "German",
    "el": "Greek",
    "en": "English",
    "es": "Spanish",
    "fi": "Finnish",
    "fr": "French",
    "he": "Hebrew",
    "hi": "Hindi",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "ms": "Malay",
    "nl": "Dutch",
    "no": "Norwegian",
    "pl": "Polish",
    "pt": "Portuguese",
    "ru": "Russian",
    "sv": "Swedish",
    "sw": "Swahili",
    "tr": "Turkish",
    "zh": "Chinese",
}

_model = None
_device = "cpu"
_model_sr = 24000
_state = "unloaded"  # unloaded | loading | ready | generating | failed
_last_error: str | None = None
_t3_model = "v3"


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _log(message: str) -> None:
    sys.stderr.write(message.rstrip() + "\n")
    sys.stderr.flush()


def _gpu_info() -> dict[str, Any]:
    info: dict[str, Any] = {
        "cuda_available": False,
        "device": _device,
        "gpu_name": None,
        "cuda_version": None,
        "torch_version": None,
    }
    try:
        import torch

        info["torch_version"] = str(torch.__version__)
        info["cuda_available"] = bool(torch.cuda.is_available())
        info["cuda_version"] = str(torch.version.cuda) if torch.version.cuda else None
        if torch.cuda.is_available():
            info["gpu_name"] = torch.cuda.get_device_name(0)
            info["vram_total_mb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024))
    except Exception as exc:  # noqa: BLE001
        info["error"] = str(exc)
    return info


def _status_payload() -> dict[str, Any]:
    return {
        "state": _state,
        "device": _device,
        "t3_model": _t3_model,
        "sample_rate": _model_sr if _model is not None else None,
        "model_loaded": _model is not None,
        "last_error": _last_error,
        "languages": SUPPORTED_LANGUAGES,
        "emotions": list(EMOTION_PRESETS.keys()),
        "emotion_presets": EMOTION_PRESETS,
        "gpu": _gpu_info(),
        "engine_root": str(ENGINE_ROOT),
    }


def _pick_device(prefer_cuda: bool = True) -> str:
    import torch

    if prefer_cuda and torch.cuda.is_available():
        return "cuda"
    return "cpu"


def cmd_status(_params: dict[str, Any]) -> dict[str, Any]:
    return _status_payload()


def cmd_load(params: dict[str, Any]) -> dict[str, Any]:
    global _model, _device, _model_sr, _state, _last_error, _t3_model

    if _model is not None:
        return _status_payload()

    prefer_cuda = bool(params.get("prefer_cuda", True))
    t3 = str(params.get("t3_model") or "v3")
    _t3_model = t3
    _state = "loading"
    _last_error = None
    _emit({"event": "status", **_status_payload()})

    try:
        import inspect
        import torch
        import torchaudio  # noqa: F401 — used by save path; ensure import works
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        _device = _pick_device(prefer_cuda)
        _log(f"Loading Chatterbox Multilingual t3_model={t3} on {_device}…")
        load_kwargs: dict[str, Any] = {"device": _device}
        # GitHub main / newer packages accept t3_model="v3"; PyPI 0.1.7 loads multilingual V2 only.
        if "t3_model" in inspect.signature(ChatterboxMultilingualTTS.from_pretrained).parameters:
            load_kwargs["t3_model"] = t3
            _t3_model = t3
        else:
            _t3_model = "v2"
            _log("Installed chatterbox-tts has no t3_model kwarg — using package default (V2 multilingual).")
        _model = ChatterboxMultilingualTTS.from_pretrained(**load_kwargs)
        _model_sr = int(getattr(_model, "sr", 24000))
        _state = "ready"
        _last_error = None
        _log(f"Model ready on {_device}, sr={_model_sr}, t3={_t3_model}")
        return _status_payload()
    except Exception as exc:  # noqa: BLE001
        _model = None
        _state = "failed"
        _last_error = f"{type(exc).__name__}: {exc}"
        _log(traceback.format_exc())
        raise


def cmd_unload(_params: dict[str, Any]) -> dict[str, Any]:
    global _model, _state, _last_error

    _model = None
    _state = "unloaded"
    _last_error = None
    try:
        import torch
        import gc

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass
    return _status_payload()


def cmd_generate(params: dict[str, Any]) -> dict[str, Any]:
    global _state, _last_error

    text = str(params.get("text") or "").strip()
    if not text:
        raise ValueError("text is required")

    language_id = str(params.get("language_id") or "ru").lower()
    if language_id not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language_id '{language_id}'")

    out_path = Path(str(params.get("out_path") or "")).expanduser()
    if not out_path.is_absolute():
        raise ValueError("out_path must be absolute")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    audio_prompt_path = params.get("audio_prompt_path")
    prompt = None
    if audio_prompt_path:
        prompt = str(Path(str(audio_prompt_path)).expanduser())
        if not Path(prompt).is_file():
            raise FileNotFoundError(f"Reference audio not found: {prompt}")

    emotion = str(params.get("emotion") or "neutral").lower()
    preset = EMOTION_PRESETS.get(emotion, EMOTION_PRESETS["neutral"])

    exaggeration = float(params["exaggeration"]) if params.get("exaggeration") is not None else preset["exaggeration"]
    cfg_weight = float(params["cfg_weight"]) if params.get("cfg_weight") is not None else preset["cfg_weight"]
    temperature = float(params["temperature"]) if params.get("temperature") is not None else 0.8
    repetition_penalty = float(params["repetition_penalty"]) if params.get("repetition_penalty") is not None else 1.2
    min_p = float(params["min_p"]) if params.get("min_p") is not None else 0.05
    top_p = float(params["top_p"]) if params.get("top_p") is not None else 1.0

    if _model is None:
        cmd_load({"prefer_cuda": params.get("prefer_cuda", True), "t3_model": params.get("t3_model", _t3_model)})

    assert _model is not None
    _state = "generating"
    _emit({"event": "status", **_status_payload()})

    try:
        import torchaudio as ta

        gen_kwargs: dict[str, Any] = {
            "language_id": language_id,
            "exaggeration": exaggeration,
            "cfg_weight": cfg_weight,
            "temperature": temperature,
            "repetition_penalty": repetition_penalty,
            "min_p": min_p,
            "top_p": top_p,
        }
        if prompt:
            gen_kwargs["audio_prompt_path"] = prompt

        wav = _model.generate(text, **gen_kwargs)
        ta.save(str(out_path), wav, _model.sr)
        duration = float(wav.shape[-1]) / float(_model.sr)
        _state = "ready"
        _last_error = None
        return {
            **_status_payload(),
            "path": str(out_path),
            "duration": duration,
            "sample_rate": int(_model.sr),
            "exaggeration": exaggeration,
            "cfg_weight": cfg_weight,
            "emotion": emotion,
            "language_id": language_id,
        }
    except Exception as exc:  # noqa: BLE001
        _state = "failed" if _model is None else "ready"
        _last_error = f"{type(exc).__name__}: {exc}"
        _log(traceback.format_exc())
        raise


def cmd_self_test(params: dict[str, Any]) -> dict[str, Any]:
    """Short Russian generation used by setup script."""
    out = Path(str(params.get("out_path") or (ENGINE_ROOT / "logs" / "selftest-ru.wav")))
    out.parent.mkdir(parents=True, exist_ok=True)
    result = cmd_generate(
        {
            "text": str(params.get("text") or "Привет! Это локальный тест Chatterbox Multilingual."),
            "language_id": "ru",
            "out_path": str(out),
            "emotion": "neutral",
            "prefer_cuda": params.get("prefer_cuda", True),
            "t3_model": params.get("t3_model", "v3"),
        }
    )
    return result


HANDLERS = {
    "status": cmd_status,
    "load": cmd_load,
    "unload": cmd_unload,
    "generate": cmd_generate,
    "self_test": cmd_self_test,
    "align_status": cmd_align_status,
    "align_load": cmd_align_load,
    "align_unload": cmd_align_unload,
    "align": cmd_align,
}


def cmd_align_status(_params: dict[str, Any]) -> dict[str, Any]:
    from lip_sync.align import aligner_status

    return aligner_status()


def cmd_align_load(params: dict[str, Any]) -> dict[str, Any]:
    from lip_sync.align import load_aligner

    return load_aligner(prefer_cuda=bool(params.get("prefer_cuda", True)))


def cmd_align_unload(_params: dict[str, Any]) -> dict[str, Any]:
    from lip_sync.align import unload_aligner

    return unload_aligner()


def cmd_align(params: dict[str, Any]) -> dict[str, Any]:
    from lip_sync.align import align_text_wav

    text = str(params.get("text") or "").strip()
    audio_path = str(params.get("audio_path") or "")
    language_id = str(params.get("language_id") or "ru")
    return align_text_wav(
        text=text,
        audio_path=audio_path,
        language_id=language_id,
        prefer_cuda=bool(params.get("prefer_cuda", True)),
        min_cue_duration=float(params.get("min_cue_duration") or 0.045),
        anticipation=float(params.get("anticipation") or 0.03),
    )


def main() -> int:
    _emit({"event": "hello", "ok": True, "protocol": 1, "engine": "chatterbox-multilingual"})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            cmd = str(req.get("cmd") or "")
            params = req.get("params") if isinstance(req.get("params"), dict) else {}
            if cmd not in HANDLERS:
                raise ValueError(f"Unknown cmd: {cmd}")
            result = HANDLERS[cmd](params)
            _emit({"id": req_id, "ok": True, "result": result})
        except Exception as exc:  # noqa: BLE001
            _emit(
                {
                    "id": req_id,
                    "ok": False,
                    "error": f"{type(exc).__name__}: {exc}",
                    "result": _status_payload(),
                }
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
