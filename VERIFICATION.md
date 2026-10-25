# Public package verification

Checked on 2026-10-25 with Node.js 22 on macOS, using an isolated loopback server and a fresh local data directory.

- JavaScript syntax checks passed for the server, router, browser scripts, and other Node modules; Python helper syntax was checked without running optional imports.
- The workspace rendered with an empty notebook list and no bundled study materials.
- Created a synthetic notebook and added synthetic source text through the browser.
- Fixed a source-metadata save delay: notebook creation and source import now await the notebook write before presenting the saved result.
- After the fix, immediately reloading retained the source entry and its page range. Opening the entry showed the saved source text.
- No AI generation request was made during public-package checks. Model discovery does not establish successful authentication or generation.
- API generation, PDF OCR, microphone input, audio conversion, website/caption import, Anki export, mobile layouts, and other operating systems were not tested in this packaging pass.

Publication uses an explicit source-file list. Personal notebooks, uploads, runtime settings, usage logs, caches, credentials, Python environments, and QA captures are excluded. Public source was scanned for known owner identifiers, personal filesystem paths, email addresses, and common credential patterns. This is a bounded privacy check, not a comprehensive security audit.
