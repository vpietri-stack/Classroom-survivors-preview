# Interactive illustrated notes - listening-only POC

Entry: `interactive_notes_poc.html` at the app's root URL.
Lesson: Power Up 3, Unit 9, printed Student's Book p.111.

## Current experience

All four original preview infographic PNGs are shown intact and in order,
including the full first-page grammar introduction. Transparent, keyboard-
accessible buttons sit over the twelve vocabulary headings, illustrated
examples, English sentence captions, intro examples and interested-in phrase.

- Tap a vocabulary heading to hear that **individual word**.
- Tap a picture or English sentence to hear that sentence.
- The intro page's puppy/girl, boring/bored and present/past/future English
  example sentences are also playable.
- A small player shows the current English and Chinese meaning. Replay, stop
  and slower playback are available. A new tap always stops the previous clip.
- Page links jump between the four pages; optional hotspot outlines make tap
  regions visible. Normal display leaves the original art unobstructed.
- On phones, native pinch zoom or the 150%/200% page viewer can enlarge the
  original pages. Enlarged pages scroll horizontally inside their viewer.

This revision has no recording controls, speech model/scorer loads, microphone
requests, progress grading, account access or analytics/API calls. It neither
reads nor writes practice progress or teacher recordings. The earlier speech
POC is preserved in Git at commit `cfe4fa6` and a local output source backup;
it is superseded by this listening-only page, as requested.

## Audio assets

The learner plays **31 same-origin MP3 files** for 32 distinct content entries:
twelve individual words, twelve illustrated-example sentences, seven intro
sentences and one phrase. The intro's "The boy is bored" reuses that same
sentence's existing MP3.

For the twelve words, the preparation script tries Youdao British English
(`type=1`) first, then an exact existing `audio_mp3/<word>.mp3`, then Sound of
Text en-GB. Existing comparative/superlative phrase files are not substitutes
for a single-word recording. This run saved nine Youdao clips and three Sound
of Text fallbacks (`interested`, `excited`, `surprised`); the exact single-word
MP3s were absent from the existing app library. Provenance and file sizes are
in `interactive_notes_assets/word-audio-sources.json`.

The twelve earlier example-sentence MP3s remain unchanged. Sound of Text en-GB
adds six previously missing intro sentences and the interested-in phrase.
Generation uses the official [Sound of Text API](https://soundoftext.com/docs),
as already used by the app's `gen_missing_audio.js`.

Generation happens once during authoring. No Youdao, Sound of Text, remote TTS,
or model request occurs when a child taps a word or sentence. Playback does
require the static file to be reachable/cached; this page adds no service worker
or offline-pack guarantee. Audio errors offer a replay instead of getting stuck.

## Implementation

- `interactive_notes_data.js`: original lesson text, images, clip URLs and
  hotspot rectangles, specified in each source PNG's native pixel coordinates.
- `interactive_notes_poc.html/.css/.js`: original-page viewer, proportional
  native buttons, zoom, one-at-a-time audio, replay/stop/speed and error recovery.
- `interactive_notes_assets/`: the **unmodified** four source PNGs, sentence
  audio, standalone vocabulary audio and word-audio provenance.
- `tools/generate_interactive_notes_words.cjs`: requested vocabulary fallback
  order, MP3 signature checks and same-origin asset preparation.
- `tools/generate_interactive_notes_audio.cjs`: missing sentence/phrase audio
  preparation; skips already-saved valid assets.

Hotspot coordinates scale with the image, not the browser viewport, so tap
targets stay aligned at different sizes and zoom. There is no OCR dependency
or raster editing. Stale ended/error callbacks cannot interrupt a newer clip;
hiding/leaving the page stops audio. A 45-second safety timeout allows retry
if playback fails to finish. If a static-host media/range request fails or does
not start within four seconds, the player retries a full same-origin GET with
a 15-second fetch timeout, then plays an audio/mpeg Blob URL. Successful Blob
URLs are reused in memory (at most the 31 clips) and revoked on page exit.
This adds no external TTS, microphone access or persistent practice state.

The standalone reader remains listening-only and independent of account APIs. In
the preview app, PreviewNotes now opens this reader in an iframe on assignment
to PU3 U9 p111. Its final Chinese button launches normal Study rounds with five
random original page vocabulary items and five random existing page boards from
all four non-spelling types. Study completion uses ordinary SR, logging and
weekly credit; completed notes reopen through 预习笔记 without a required session.
See the Study, auth, data-model and telemetry wiki pages for the integration.

## Verification

Serve the checkout root and open
`http://127.0.0.1:8093/interactive_notes_poc.html`, or use the HTTPS preview URL.

```
node test_interactive_notes_poc.js
node test_interactive_notes_poc_browser.js [local-or-hosted-page-url]
npm test
```

The first suite checks full four-page coverage, every word and intro sentence,
original image dimensions, hotspot bounds/reachability and MP3 signatures, plus
absence of speech, microphone, storage and API paths in the active entry.

The browser suite clicks **all 49 hotspots**, verifies each correct audio URL,
tests stop/replay/slower speed, stale-callback protection, audio errors, hotspot
guides, 320px layout and viewer zoom. Every one of the 31 unique MP3s is actually
decoded by Chrome. It separately plays one intro sentence and one word to their
natural end without mocking playback. Requests are restricted to the same
origin; no model/API/external calls or microphone requests are permitted.
Rendered hotspot alignment is visually reviewed on all four pages.

These POC suites remain outside the production root test chain.

## Optional speech in notes (preview, 2026-10-28d)

`notes_speech.js` adds a second row to the existing bottom player on preview and
localhost only. Select any word or sentence, tap the microphone to record, and
tap again to stop. The current LocalEngine target-aware checker receives the exact
selected text and an abort signal; only `targetWords[].heardClear` words become
green. Other words stay neutral. This is encouragement, not a pronunciation grade.
Own-recording playback and retries are optional; original audio/speed/stop controls
remain. The embedded reader shares its parent's model instance; standalone
readers load the existing recorder and engine lazily on first microphone use.
The iframe explicitly allows microphone access. Preparation/recording/checking
have bounded waits. Target changes, stop, hide and exit cancel work and release
microphone resources; recordings remain in memory and are revoked on replacement
or exit. Nothing is uploaded or credited to SR/targets. Study completion is unchanged.
`test_notes_speech_browser.js` mocks recognition outcomes to exercise the actual
player controls, target identity, selective green feedback, retry, recording
playback, cancellation/stale results, denied permission and 320px layout. The
existing target-model and recorder suites cover their underlying implementation.
