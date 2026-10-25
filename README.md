# Recall Lab

A local study workspace for turning learning materials into notes, flashcards, practice questions, and mock exams. Maintained by [Solohkg](https://github.com/Solohkg).

## Why this project exists

Students should be able to organise their study materials and practise active recall without paying another software subscription. The goal is to provide the toolkit free of charge and make it useful to thousands of students over time. This is an ambition, not a claim of current adoption.

The software is MIT-licensed. AI inference is separate: the current backend uses the student's own authenticated Codex CLI and its available models and allowance. Access, quotas, and any provider charges still apply. A provider-neutral bring-your-own-agent interface is a future direction, not a feature already implemented.

## Features in the prototype

- Source-based study notes, editable flashcards, practice tests, and mindmaps.
- Exam-focus instructions, a study tutor, and MCQ / written / mixed mock-exam controls.
- Local objective marking, timers, saved material reuse, and response caching to reduce AI requests.
- PDF and text input, optional DOCX/PPTX extraction, website text and available YouTube captions.
- Flashcard TSV and optional Anki exports.
- Optional macOS narration and downloadable audio.

This is a prototype. Feature availability depends on the installed tools, provider, and input format; it is not a guarantee of factual accuracy, accessibility, or parity with any commercial product.

## Run locally

Install Node.js 18 or newer. From this directory:

```sh
npm start
```

Open **http://127.0.0.1:5188/**. The server binds to loopback only. It creates its own empty `data/` directory at first launch. No original notebooks, uploaded documents, chat history, user settings, or account credentials are included in this public version.

For AI features, install and authenticate your own Codex CLI using its official setup instructions. The app looks for `codex` on your PATH or in supported macOS app locations; `CODEX_BIN` can select another installed binary. Use the AI Models panel to select a model available to your account. The Auto defaults require the named models to be available; choose a model manually if they are unavailable. The launcher uses CLI flags that may require adaptation for your CLI version. Login credentials are not bundled or provisioned by Recall Lab.

Optional document extraction and Anki / caption tools:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Text-based DOCX/PPTX extraction uses Python's standard library. Anki export requires `genanki`, and caption import uses `yt-dlp`. macOS audio uses the system `say` and `afconvert` commands; other operating systems need a replacement audio backend. Optional tool versions are not locked in this prototype.

## Data and privacy

- Notebooks, imports, settings, AI request receipts, cached responses, and generated audio stay under `data/` on the computer running the app. That directory is excluded from Git.
- Using an AI feature sends the selected prompt and source material to the user's configured Codex service. Local storage does not mean offline AI processing.
- Importing a public website or video contacts that website or caption service.
- The server has no hosted multi-user authentication. Keep it on loopback; do not expose it directly to the internet.
- Use synthetic examples in issues and pull requests. Never publish student records, credentials, personal notebooks, or private source documents.

## Current limits

This public distribution has no established usage metrics or community support commitment. It does not include a hosted AI service, free AI credits for every student, a public cloud deployment, or an automatic migration of private study data. Scanned PDF OCR, microphone recognition, caption access, and AI generation depend on external capabilities. Model output needs checking against the original sources.

The public packaging checks cover a clean startup and local study flow. They do not establish that every AI account, operating system, import format, or accessibility workflow works. See [VERIFICATION.md](VERIFICATION.md) for the exact checks performed.

## Contributing

Reproducible setup, accessibility, test coverage, study exports, and a provider-neutral agent adapter are useful areas for contributions. Describe the problem and expected behaviour in a GitHub issue; propose code changes through a pull request. Keep examples synthetic and never attach private notes or account details.

## License

Original project code is MIT-licensed; see [LICENSE](LICENSE). Bundled PDF.js files retain their Apache-2.0 notices and are covered separately by [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
