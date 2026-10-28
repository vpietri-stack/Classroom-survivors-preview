# Optional single-word POC model

English Moonshine Tiny, ONNX Community q8 encoder and merged decoder. Used only
by the explicitly selected model on `speech_word_poc.html`; never preloaded by
Study, notes or the normal app. All audio inference stays on the device.

Source: https://huggingface.co/onnx-community/moonshine-tiny-ONNX
Pinned revision and per-file SHA-256/size: `manifest.json`.
Total assets approximately 32.1 MB including the tokenizer (weights 28.2 MB).
Runtime is the existing version-locked Transformers.js/ORT pair, with local
fallback. Pinned verified download chunks are retained in CacheStorage where supported; browser eviction
can require another download. No runtime or shared Whisper model was changed.

The retained upstream LICENSE explicitly covers English Tiny under MIT.
Licence source: https://github.com/moonshine-ai/moonshine/blob/main/LICENSE
The runtime uses `allowLocalModels=true`, `allowRemoteModels=false`. The asset
loader separately fetches public pinned model bytes from raw GitHub, gh-proxy,
HF mirror, Hugging Face or same-origin, with resumable ranges and SHA-256 checks.
No audio or teacher data is sent to those hosts. A model worker is terminated before the other model starts and
after comparison, including on cancellation, hidden page, timeout and errors.

Moonshine produces independent free transcription only. Its transcript match
is displayed separately from Whisper's target-aware hint; no unvalidated
Moonshine pronunciation checker or numeric grade is implied.
