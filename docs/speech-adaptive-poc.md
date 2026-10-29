# Adaptive speech practice preview

`speech_adaptive_poc.html` is a standalone, account-free teacher experiment. It does not change the app's current speaking step, notes, progression, collection, API or production deployment.

The selected approach retains the existing Whisper tiny.en q8 numerical weights. It compares captured audio with the expected text **after independent transcription**, accepts clear and close readings, and shows green/neutral words on the original target tiles. Retry is optional. This is encouragement, not a validated pronunciation grade.

## Measured selection and independent check

Private research compared Tiny/Base Whisper, Tiny/Base Moonshine, wav2vec2 CTC, keyword spotting, audio preparation, actual beam decoding, phonetic matching, causal target likelihoods and encoder context lengths. Larger models were not a sufficiently better overall tradeoff to justify replacing Tiny. Synthetic voices were kept separate from natural student data.

Configuration and calibration were frozen before opening the final 83 student recordings from 12 different speakers:

| Teacher's judgement | Current engine highlighted | New candidate highlighted |
|---|---:|---:|
| Clear word | 281 / 353 | 340 / 353 |
| Close enough | 7 / 23 | 22 / 23 |
| Wrong word | 1 / 6 | 3 / 6 |
| Missing word | 3 / 8 | 3 / 8 |
| Mumbled word | 2 / 6 | 1 / 6 |

Thus 74 additional clear/close words were accepted, with one additional imperfect word accepted overall. The 122 unjudgeable words are excluded. The final set contains no confirmed whole-clip no-target negatives; eight ambiguous whole-clip labels must not be treated as verified silence.

On 25 reserved British synthetic single-word clips, the new rule accepted 24, versus 21 with the unchanged checker. Chinese-language-setting synthesis produced 19 / 25 versus 9 / 25, but requested text is not proof that every generated recording is a correct English reading. These counts are engineering proxies, not child recognition accuracy. Two teacher-validated child word cuts were development support, not naturally isolated-word validation. Recordings, references, evaluation outputs and speaker IDs stay outside Git.

## Frozen behaviour

- Word: minimum encoder context 12 seconds, retaining all recorded speech; exact spoken-form match, generous phonetic match, or bounded causal audio/target evidence. Numerals such as `2` can match `two` / `to`. Unknown ASR spellings require spelling and audio evidence.
- Sentence / short phrase: minimum context 8 seconds, 17-feature binary calibration; clear and close are positive. A voice-presence check applies to every route.
- Dynamic position slicing removes unused encoder silence. Numerical speech weights are unchanged. Full 30-second context was checked against the original encoder. Stale optional ONNX shape annotations were removed; computation nodes and weights are identical. Public-worker decisions were checked against the frozen private evidence.
- The pinned runtime filters supplied `encoder_outputs` unless `forward_params` includes that name. The shared-encoder path explicitly permits it and counts encoder calls, asserting that independent generation performs zero additional encoding passes. Expected text never enters that generation.
- Use one WASM thread and existing stable `Classroom-survivors-lib/tjs-v3/` runtime URLs; no WebGPU, COOP/COEP or SharedArrayBuffer requirement is added. Real older-phone timing still requires device checks.

## Downloads, cache and limits

Cold speech assets plus the matched browser runtime total about **73 MB**, under the 150 MB budget. If existing speech files remain in the legacy cache, only about **5.2 MB** of helpers need downloading: Silero VAD, compact public CMUdict, calibration and a roughly 3.4 KB encoder patch. Legacy model entries are read and SHA-256 verified, never replaced. The patch reconstructs the adaptive encoder in a fresh buffer and verifies its result hash.

New downloads use a separate content-hash cache, resumable 256 KB parts, four fetches at most, per-route deadlines and complete-file verification. Retry can prefer same-origin files after a failed mirror/runtime attempt. Shared runtime files are not modified. Evicted caches may require the full download.

Release 2026-10-29c optionally transfers the dictionary as a 795,657-byte gzip file instead of 2,840,141 bytes. Feature-detected native decompression runs in the worker; browsers without it, or with a failed compressed route, retain the original verified transfer. Both compressed and decoded hashes must match. This reduces new helper transfer to about 3.1 MB when supported (5.2 MB otherwise), with identical dictionary/model decisions. Chunk requests settle before fallback, and exhausted route lists can recover on subsequent chunks instead of permanently rejecting all sources. No new browser requirement or recognition threshold is introduced.

Release 2026-10-29b fixes a hosted-preparation failure found after local inference passed: Windows CRLF JSON sizes/hashes differed from Git's published LF bytes. Targeted `.gitattributes` rules retain LF for manifest-covered JSON, and the manifest now describes the actual published files. Legacy CRLF text entries can be read into a fresh canonical buffer only when its exact published SHA-256 verifies; the original entry stays unchanged. Module/manifest queries advance to v2. This changes packaging and cache compatibility, not recognition settings or model weights.

Audio imports request a 16 kHz decoding context, falling back to the browser's default when unsupported. This avoids decoding an already-16-kHz recording at the hardware rate and then converting it back with linear interpolation. The unnecessary round trip changed a development word cut from recognised to uncertain; direct decoding restores its original voice/decision evidence. A synthetic high-frequency waveform import/export check guards signal preservation. Microphone capture, frozen thresholds and final evaluation settings are unchanged.

Capture/import is capped at 20 seconds and 10 MB, permission at 15 seconds, preparation at five minutes, and warmed checking at five seconds. Cancel, hiding and leaving terminate pending work and microphone tracks. Timeout leaves neutral feedback and permits another attempt or moving on. No recording, account, progress or analytics request is sent. WAV/results exports occur only when requested. Distinguish desktop browser timings from actual student hardware.

## Files and validation

The POC, worker, asset loader, evidence, phonetic and decision modules are named `speech_adaptive_*`. Public helper assets and licenses live in `speech_assets/adaptive-20261029a/`. `test_speech_adaptive.js` verifies hashes, exact cache-preserving reconstruction, budget, short-word/numeral/near-word behaviour and calibration parity. `test_speech_adaptive_browser.js` verifies tile feedback, cancellation, timeout, export and mobile layout without downloading models. Private browser evaluations perform actual WASM inference without external audio requests.

The complete root test suite passed. Actual Chromium and desktop WebKit inference gave identical tile decisions on six development examples, including the two reviewed short word cuts. Those WebKit checks took 0.91–1.20 seconds after preparation. The final 83-clip Chromium parity run had a median of 0.90 seconds and a 95th percentile of 2.02 seconds. Ninety repeated Chromium assessments showed no steadily growing process-memory use; the current engine's warmed process family was comparable. These desktop measurements do not establish old-phone speed or RAM requirements. Forty-eight independently generated silence/noise checks produced no green words; this does not establish resistance to every background voice or television clip.

Preview remains separate from production. Promotion requires teacher testing and explicit production approval. Do not retune against the already-used final recordings; further accuracy claims need fresh independent recordings.
