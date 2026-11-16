import sys
import os
import json
import re
import argparse
import difflib
import numpy as np
import soundfile as sf
import vosk

# Default to the downloaded en-in small model in user cache
CACHE_DIR = os.path.expanduser("~/.cache/vosk/vosk-model-small-en-in-0.4")


def clean_word(w):
    """Normalize word: lowercase and strip non-alphanumeric chars."""
    return re.sub(r"[^\w\s]", "", w).strip().lower()


def align_words(expected_words, spoken_words):
    """
    Align reference paragraph words with Vosk recognized words using sequence matcher.
    Labels each expected word as 'correct' (green), 'missing' (red), or 'mispronounced' (yellow).
    """
    expected_clean = [clean_word(w) for w in expected_words]
    spoken_clean = [clean_word(w.get("word", "")) for w in spoken_words]

    matcher = difflib.SequenceMatcher(None, expected_clean, spoken_clean)
    analysis = []
    correct_count = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for idx in range(i1, i2):
                sp_idx = j1 + (idx - i1)
                sp_word = spoken_words[sp_idx] if sp_idx < len(spoken_words) else {}
                conf = sp_word.get("conf", 1.0)
                analysis.append({
                    "expected": expected_words[idx],
                    "spoken": sp_word.get("word", expected_words[idx]),
                    "status": "correct",
                    "confidence": round(conf, 2),
                })
                correct_count += 1

        elif tag == "replace":
            # Some words were spoken differently (mispronounced or substituted)
            exp_slice = range(i1, i2)
            sp_slice = range(j1, j2)
            max_len = max(len(exp_slice), len(sp_slice))

            for k in range(max_len):
                has_exp = k < len(exp_slice)
                has_sp = k < len(sp_slice)

                if has_exp and has_sp:
                    e_idx = i1 + k
                    s_idx = j1 + k
                    sp_word = spoken_words[s_idx]
                    analysis.append({
                        "expected": expected_words[e_idx],
                        "spoken": sp_word.get("word", ""),
                        "status": "mispronounced",
                        "confidence": round(sp_word.get("conf", 0.5), 2),
                    })
                elif has_exp and not has_sp:
                    e_idx = i1 + k
                    analysis.append({
                        "expected": expected_words[e_idx],
                        "spoken": "",
                        "status": "missing",
                        "confidence": 0.0,
                    })

        elif tag == "delete":
            # Words in expected that were omitted / not spoken
            for idx in range(i1, i2):
                analysis.append({
                    "expected": expected_words[idx],
                    "spoken": "",
                    "status": "missing",
                    "confidence": 0.0,
                })

        elif tag == "insert":
            # Extra words inserted by student not in reference paragraph
            # We don't penalize expected alignment, but can track if needed
            pass

    total_expected = len([w for w in expected_words if clean_word(w)])
    accuracy = (correct_count / total_expected * 100) if total_expected > 0 else 0.0

    return analysis, round(accuracy, 1)


def evaluate_audio(audio_path, target_paragraph, model_path=None):
    if not os.path.exists(audio_path):
        return {"success": False, "error": f"Audio file not found: {audio_path}"}

    # Load Vosk Model
    vosk.SetLogLevel(-1) # Suppress verbose C++ logs
    m_path = model_path or (CACHE_DIR if os.path.exists(CACHE_DIR) else None)
    
    if m_path and os.path.exists(m_path):
        model = vosk.Model(m_path)
    else:
        model = vosk.Model(model_name="vosk-model-small-en-in-0.4")

    # Read audio with soundfile
    data, samplerate = sf.read(audio_path)
    duration_seconds = len(data) / samplerate

    # Convert to mono if stereo
    if len(data.shape) > 1:
        data = data.mean(axis=1)

    # Convert to 16-bit PCM integer bytes
    data_16 = (data * 32767).astype(np.int16)
    audio_bytes = data_16.tobytes()

    # Recognize using KaldiRecognizer
    rec = vosk.KaldiRecognizer(model, samplerate)
    rec.SetWords(True)

    rec.AcceptWaveform(audio_bytes)
    res_json = json.loads(rec.FinalResult())

    spoken_words = res_json.get("result", [])
    transcribed_text = res_json.get("text", "")

    # Clean words from target paragraph
    expected_words = [w for w in target_paragraph.split() if w.strip()]

    # Align and analyze
    word_analysis, accuracy = align_words(expected_words, spoken_words)

    # Calculate WPM
    words_spoken_count = len(spoken_words)
    duration_minutes = duration_seconds / 60.0
    wpm = round(words_spoken_count / duration_minutes) if duration_minutes > 0 else 0

    return {
        "success": True,
        "accuracy_score": accuracy,
        "wpm": wpm,
        "duration_seconds": round(duration_seconds, 1),
        "transcribed_text": transcribed_text,
        "word_analysis": word_analysis,
        "total_expected_words": len(expected_words),
        "total_spoken_words": words_spoken_count,
    }


def main():
    parser = argparse.ArgumentParser(description="Vosk Speech Evaluation Service")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--paragraph", required=True, help="Target reference paragraph")
    parser.add_argument("--model", default=None, help="Path to custom vosk model directory")

    args = parser.parse_args()

    try:
        result = evaluate_audio(args.audio, args.paragraph, args.model)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

