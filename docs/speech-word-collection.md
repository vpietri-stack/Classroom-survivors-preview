# Guided teacher word collection

The preview-only `speech_word_collection.html` has 148 unique words and 333
prompts: 148 clear, 32 brisk, 68 deliberate near-word substitutions, 12 fresh
repeats, 12 sentence controls, eight homophone controls, 16 quiet, 16 mumbled,
16 optional imitated-learner takes, and five non-speech controls. Core clear and
contrast rounds are first; 15–20 prompts per sitting is enough.

The phonetic families cover vowel length/quality, r/l, th/s/t, voiced/unvoiced
consonants, word-final consonants and inflections, consonant clusters, common
short function words, and long/stress-sensitive words. This is deliberately
varied adult development material, not a population-representative child test.
The fixed plan is in `speech_collection_plan.js`. All word versions and their
related confusable forms share a family and split. About a fifth of prompts
are reserved by family (63 of 333); all five non-speech controls stay together.
The collection page reveals no model predictions and makes no acoustic grade.

Each take records expected text, intended/actually spoken text, condition,
speaker/device labels, teacher-reviewed judgement, notes, capture sample rate,
audio statistics, anonymous take ID, time and SHA-256. Actual untrimmed mono
audio is resampled to 16 kHz PCM. Microphone filters match the app's settings.
The speaker must listen and confirm the label before saving. Accent imitation
requires a description and is never treated as natural child accent data.
Equivalent spellings (see/sea, two/too, right/write, night/knight) are explicit
controls, not labelled wrong simply for spelling. Mumbled/quiet recordings are
labelled by what was heard, not automatically by the requested style.

## Storage and backup

No login, cloud/audio upload, analytics, speech model or worker is loaded. A
dedicated IndexedDB database `speech-word-collection-v1` stores blobs and metadata
atomically. Navigation moves only after transaction completion. IDs are new on
every saved take; old takes are retained. An unsaved draft locks navigation and
has its own audio download/discard controls. Pending microphone permission and
recording are bounded to 15/20 seconds; hiding the page stops capture.

The full JSON backup includes base64 WAVs and labels. Browser storage can be
evicted, so download backups regularly. Restore checks the plan, labels, WAV
format and hashes before one atomic import; matching takes merge, conflicting
IDs fail without overwriting. Limits: 1,000 takes, 75 MB audio, 100 MB import.
Backups and recordings are private artifacts and must never be committed.

## Evaluation after recording

1. Validate the backup with `node speech_collection_inspect.cjs <backup.json>`.
   This writes a development-only WAV/metadata manifest under gitignored
   `.hermes/word-collection/<id>/`; reserved prompts remain in the backup.
2. Freeze the configurations before using the reserved teacher check. Use
   identical audio for unchanged Whisper, no repetition, preserved beginning,
   padding and Moonshine. Preserve the raw clip so padding cannot silently
   redefine which samples are eligible. Distinguish transcript matches,
   homophone equivalence, checker duration/energy rejection, and target hints.
3. Compare acceptance of clear/acceptable readings and false acceptance of
   deliberately wrong, unintelligible and non-speech takes. Report each
   condition and word family separately; do not treat all repeats as independent
   speakers. Recognition time and extra target-check time must be reported
   separately. Current lab worker returns Whisper `timeSec` and
   `targetCheckMs`; total `ms` is not a fair ASR-only speed comparison.
4. Replay the existing **labelled student development** sentences on the same
   configurations, separately from adult word/stress results. Keep natural
   child accents distinct from adult imitations. The 83 reserved student clips
   are not development material and must stay untouched until the final choice.
5. Check load, warm latency and stability on the actual home devices. A
   word/sentence model split is a valid candidate, not an assumed improvement;
   account for keeping/downloading both models if selected. Change no live
   grading or production models based on this adult collection alone.

No results or winning model are claimed before these recordings exist.
