"""
Local forced alignment for KRX Cartoon Studio Lip Sync.

Uses known text + WAV (NOT speech-to-text). Engine: ctc-forced-aligner
(MahmoudAshraf97) with Meta MMS CTC model — char-level spans for RU/EN.

Kept modular from Chatterbox TTS.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

# Cyrillic / Latin → cartoon viseme ids (REST/A/E/I/O/U/MBP/FV/L/WQ/CONSONANT/CHJSH)
_OPEN_A = set("аяaáàâäã")
_ROUND_O = set("оёoóòôöõ")
_ROUND_U = set("уюuúùûüw")
_WIDE_E = set("еэeéèêë")
_WIDE_I = set("иыiíìîïyý")
_MBP = set("мбпmbp")
_FV = set("фвfv")
_L = set("лl")
_WQ = set("wq")  # also soft у handled above
_CHJSH = set("чжшщджcjshж")
_REST = set(" \t\n\r.,!?;:…—–-'\"«»()[]{}")


def char_to_viseme(raw: str) -> str:
    ch = (raw or "").lower()
    if not ch or ch in _REST or re.match(r"[0-9]", ch):
        return "REST"
    if ch in _MBP:
        return "MBP"
    if ch in _FV:
        return "FV"
    if ch in _L:
        return "L"
    if ch in _CHJSH or ch in ("ж", "ш", "щ", "ч", "дж"):
        return "CHJSH"
    if ch in _OPEN_A:
        return "A"
    if ch in _ROUND_O:
        return "O"
    if ch in _ROUND_U:
        return "U"
    if ch in _WIDE_E:
        return "E"
    if ch in _WIDE_I:
        return "I"
    if ch in _WQ:
        return "WQ"
    if re.match(r"[a-zа-яё]", ch):
        return "CONSONANT"
    return "REST"


def language_iso3(language_id: str) -> str:
    lid = (language_id or "ru").lower().strip()
    mapping = {
        "ru": "rus",
        "en": "eng",
        "de": "deu",
        "fr": "fra",
        "es": "spa",
        "it": "ita",
        "pt": "por",
        "pl": "pol",
        "nl": "nld",
        "sv": "swe",
        "tr": "tur",
        "zh": "cmn",
        "ja": "jpn",
        "ko": "kor",
        "ar": "ara",
        "hi": "hin",
    }
    if len(lid) == 3:
        return lid
    return mapping.get(lid, "rus")


_align_model = None
_align_tokenizer = None
_align_device = "cpu"
_align_state = "unloaded"  # unloaded | loading | ready | failed
_align_error: str | None = None


def aligner_status() -> dict[str, Any]:
    return {
        "state": _align_state,
        "device": _align_device,
        "model_loaded": _align_model is not None,
        "last_error": _align_error,
        "engine": "ctc-forced-aligner",
        "default_model": "MahmoudAshraf/mms-300m-1130-forced-aligner",
    }


def load_aligner(prefer_cuda: bool = True) -> dict[str, Any]:
    global _align_model, _align_tokenizer, _align_device, _align_state, _align_error
    if _align_model is not None:
        return aligner_status()
    _align_state = "loading"
    _align_error = None
    try:
        import torch
        from ctc_forced_aligner import load_alignment_model

        _align_device = "cuda" if prefer_cuda and torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if _align_device == "cuda" else torch.float32
        _align_model, _align_tokenizer = load_alignment_model(_align_device, dtype=dtype)
        _align_state = "ready"
        return aligner_status()
    except Exception as exc:  # noqa: BLE001
        _align_model = None
        _align_tokenizer = None
        _align_state = "failed"
        _align_error = f"{type(exc).__name__}: {exc}"
        raise


def unload_aligner() -> dict[str, Any]:
    global _align_model, _align_tokenizer, _align_state, _align_error
    _align_model = None
    _align_tokenizer = None
    _align_state = "unloaded"
    _align_error = None
    try:
        import gc
        import torch

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass
    return aligner_status()


def _smooth_cues(
    cues: list[dict[str, Any]],
    *,
    min_duration: float = 0.045,
    merge_same: bool = True,
) -> list[dict[str, Any]]:
    if not cues:
        return []
    # Drop tiny non-REST, merge into neighbors; merge identical neighbors
    cleaned: list[dict[str, Any]] = []
    for cue in cues:
        dur = float(cue["duration"])
        if dur < min_duration and cue["viseme"] != "REST" and cleaned:
            # extend previous
            cleaned[-1]["duration"] = float(cleaned[-1]["duration"]) + dur
            continue
        if merge_same and cleaned and cleaned[-1]["viseme"] == cue["viseme"]:
            cleaned[-1]["duration"] = float(cleaned[-1]["duration"]) + dur
            continue
        cleaned.append({**cue})
    # Recompute absolute times
    t = 0.0
    out: list[dict[str, Any]] = []
    for cue in cleaned:
        dur = max(min_duration if cue["viseme"] != "REST" else 0.02, float(cue["duration"]))
        out.append(
            {
                "time": round(t, 4),
                "duration": round(dur, 4),
                "viseme": cue["viseme"],
                "confidence": cue.get("confidence"),
                "token": cue.get("token"),
            }
        )
        t += dur
    return out


def align_text_wav(
    *,
    text: str,
    audio_path: str,
    language_id: str = "ru",
    prefer_cuda: bool = True,
    min_cue_duration: float = 0.045,
    anticipation: float = 0.03,
) -> dict[str, Any]:
    """Forced-align known text to WAV; return LipSyncData-compatible payload."""
    text = (text or "").strip()
    if not text:
        raise ValueError("text is required")
    path = Path(audio_path).expanduser()
    if not path.is_file():
        raise FileNotFoundError(f"WAV not found: {path}")

    if _align_model is None:
        load_aligner(prefer_cuda=prefer_cuda)

    import torch
    from ctc_forced_aligner import (
        generate_emissions,
        get_alignments,
        get_spans,
        load_audio,
        postprocess_results,
        preprocess_text,
    )

    assert _align_model is not None and _align_tokenizer is not None
    language = language_iso3(language_id)
    # Default MMS model expects romanization for non-Latin scripts (official README).
    romanize = language not in {"eng"} or True

    audio_waveform = load_audio(str(path), _align_model.dtype, _align_model.device)
    emissions, stride = generate_emissions(_align_model, audio_waveform, batch_size=8)
    tokens_starred, text_starred = preprocess_text(text, romanize=romanize, language=language)
    segments, scores, blank_token = get_alignments(emissions, tokens_starred, _align_tokenizer)
    spans = get_spans(tokens_starred, segments, blank_token)
    word_timestamps = postprocess_results(text_starred, spans, stride, scores)

    # Prefer character-level: expand word spans by character weights when split is word-level
    raw_cues: list[dict[str, Any]] = []
    for item in word_timestamps:
        token = str(item.get("text") or item.get("token") or "")
        start = float(item.get("start") or 0.0)
        end = float(item.get("end") or start)
        conf = item.get("score")
        if conf is not None:
            try:
                conf = float(conf)
            except Exception:  # noqa: BLE001
                conf = None
        chars = [c for c in token if c.strip() or c in _REST]
        if not chars:
            raw_cues.append(
                {
                    "time": start,
                    "duration": max(0.02, end - start),
                    "viseme": "REST",
                    "confidence": conf,
                    "token": token,
                }
            )
            continue
        total = sum(1.2 if char_to_viseme(c) in {"A", "O", "U", "E", "I"} else 1.0 for c in chars) or 1.0
        cursor = start
        span = max(0.02, end - start)
        for i, ch in enumerate(chars):
            w = 1.2 if char_to_viseme(ch) in {"A", "O", "U", "E", "I"} else 1.0
            dur = span * (w / total)
            if i == len(chars) - 1:
                dur = max(0.02, end - cursor)
            raw_cues.append(
                {
                    "time": cursor,
                    "duration": dur,
                    "viseme": char_to_viseme(ch),
                    "confidence": conf,
                    "token": ch,
                }
            )
            cursor += dur

    # Apply anticipation (shift cues slightly earlier, clamp at 0)
    if anticipation > 0:
        for cue in raw_cues:
            cue["time"] = max(0.0, float(cue["time"]) - anticipation)

    # Normalize to contiguous cues from durations
    normalized = []
    for cue in raw_cues:
        normalized.append(
            {
                "time": float(cue["time"]),
                "duration": float(cue["duration"]),
                "viseme": cue["viseme"],
                "confidence": cue.get("confidence"),
                "token": cue.get("token"),
            }
        )
    # Sort and rebuild as contiguous timeline for playback stability
    normalized.sort(key=lambda c: c["time"])
    rebuilt: list[dict[str, Any]] = []
    for cue in normalized:
        rebuilt.append(
            {
                "duration": float(cue["duration"]),
                "viseme": cue["viseme"],
                "confidence": cue.get("confidence"),
                "token": cue.get("token"),
            }
        )
    cues = _smooth_cues(rebuilt, min_duration=min_cue_duration)

    # Duration from audio
    try:
        import torchaudio

        info = torchaudio.info(str(path))
        duration = float(info.num_frames) / float(info.sample_rate)
    except Exception:  # noqa: BLE001
        duration = cues[-1]["time"] + cues[-1]["duration"] if cues else 0.0

    # Ensure cues cover full duration with trailing REST
    if cues:
        end_t = cues[-1]["time"] + cues[-1]["duration"]
        if end_t < duration - 0.02:
            cues.append({"time": round(end_t, 4), "duration": round(duration - end_t, 4), "viseme": "REST"})
        elif end_t > duration and duration > 0:
            # scale down lightly
            scale = duration / end_t
            t = 0.0
            scaled = []
            for cue in cues:
                d = float(cue["duration"]) * scale
                scaled.append({**cue, "time": round(t, 4), "duration": round(d, 4)})
                t += d
            cues = scaled

    return {
        "version": 1,
        "audioPath": str(path),
        "text": text,
        "duration": round(duration, 4),
        "cues": cues,
        "engine": "ctc-forced-aligner",
        "language": language,
        "aligner": aligner_status(),
        "wordCount": len(word_timestamps),
    }


if __name__ == "__main__":
    # CLI self-test: python -m lip_sync.align audio.wav "text" ru
    wav = sys.argv[1] if len(sys.argv) > 1 else ""
    txt = sys.argv[2] if len(sys.argv) > 2 else "Привет"
    lang = sys.argv[3] if len(sys.argv) > 3 else "ru"
    print(json.dumps(align_text_wav(text=txt, audio_path=wav, language_id=lang), ensure_ascii=False, indent=2))
