#!/usr/bin/env python3
"""Writes out what is said in an audio file, for Claude to read before it writes a video's SEO.

Usage: python3 scripts/transcribe.py audio.wav > transcript.txt
Uses faster-whisper on the CPU (pip install -r scripts/requirements-transcribe.txt).
WHISPER_MODEL picks the model (default "small": good enough for Urdu, about 30 seconds per minute of audio).
WHISPER_LANGUAGE sets the language (default "ur"; "auto" lets Whisper guess).
Prints one line per spoken part: "[m:ss] text".
"""
import os
import sys

from faster_whisper import WhisperModel


def stamp(seconds: float) -> str:
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: transcribe.py <audio file>")
    language = os.environ.get("WHISPER_LANGUAGE", "ur")
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
    segments, _ = model.transcribe(
        sys.argv[1],
        language=None if language == "auto" else language,
        vad_filter=True,  # skips music and silence, where Whisper tends to invent words
        beam_size=5,
    )
    for s in segments:
        text = s.text.strip()
        if text:
            print(f"[{stamp(s.start)}] {text}", flush=True)


if __name__ == "__main__":
    main()
