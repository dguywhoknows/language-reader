# language-reader

[![tests](https://github.com/dguywhoknows/language-reader/actions/workflows/tests.yml/badge.svg)](https://github.com/dguywhoknows/language-reader/actions/workflows/tests.yml)

Learn a language by reading: tap any word for a context-aware AI gloss, track known words, generate graded stories, quiz yourself and listen with text-to-speech.

Live: https://dguywhoknows.github.io/language-reader/

## Overview

Lang Lens follows the comprehensible-input approach used by apps like LingQ. Generate a story at your CEFR level (A1 to C1) on any topic, or paste real text. Every word is tokenized with Intl.Segmenter, so it works even for Japanese, Chinese and Korean, and colored by your knowledge state (new, learning, known). Tap a word for an AI gloss that uses the sentence to pick the right sense: lemma, part of speech, translation, a fresh example and a grammar note. Tap ¶ to translate a whole sentence. A live comprehension estimate shows what share of the text you understand, and a 4-question quiz checks the gist.

## Pages

- **Read**
- **Review**
- **Library**
- **Vocabulary**
- **Stats**
- **Settings**

## Features

- AI graded stories at CEFR A1-C1 on any topic, or bring your own text
- Language-aware tokenization with Intl.Segmenter (word + sentence), including CJK
- Per-language vocabulary graph: new → learning → known, with lookup counts
- Context-sensitive glosses (lemma, POS, gender, example, grammar note), cached locally
- Sentence translation toggles, text-to-speech for words and full text
- Token-weighted comprehension estimate, 'mark remaining as known', CSV export
- AI comprehension quiz with instant local grading
- Review page: spaced repetition (SM-2 variant) over the words you looked up, either recalling the meaning or typing the missing word into the sentence you met it in; answers are graded tolerantly for accents, case and a single typo, and words graduate to known after a three-week interval
- Library page: every generated, pasted or imported .txt text is kept per language with its estimated level, word count and how much of it you understand
- Vocabulary page: searchable table with editable translations and states, due dates and context sentences; CSV and Anki (TSV with the word bolded in context) export, CSV/TSV import that never downgrades known words
- Stats page: known/learning totals, study streak, 30-day lookups and reviews chart, and the most frequent unknown words in the current text
- Estimated CEFR level per text from sentence length and word length

## How it works

LLM calls are used for:

- Graded reader generation constrained to CEFR level
- Context-aware dictionary lookups (JSON)
- Sentence translation and comprehension-quiz generation

Everything else (tokenization, vocabulary state, comprehension scoring, TTS, persistence, export) runs locally in the browser.

## Getting started

No build step and no dependencies. Serve the folder with any static server:

```bash
git clone https://github.com/dguywhoknows/language-reader.git
cd language-reader
python -m http.server 8000
```

Then open http://localhost:8000.

`index.html` is the public home page, `login.html` handles accounts and `app.html` is the app.

### Telling the app what to do

Every page has an **Ask AI** box (Ctrl/Cmd+K). Type a request in plain words and the model plans a sequence of
calls to the app's own functions, runs them and reports back. The **Instructions** tab stores standing
preferences that are added to every AI request the app makes.

### Configuration

`src/lib/config.js` is generated from the build settings: the Supabase project (accounts) and the AI proxy URL.
Signed-in users get the built-in AI through the proxy, which keeps the provider key as a server-side secret.
Without those settings the app runs for guests, in demo mode, or with a personal [Groq](https://console.groq.com/keys)
or [OpenRouter](https://openrouter.ai/keys) key entered under **Settings → Model provider** (stored only in this
browser and sent only to that provider).

## Testing

`src/core.js` holds the app's logic as pure functions and is covered by 11 unit tests.

```bash
node tests/run-node.js        # CI runs this on every push
```

Or open `tests/index.html` in a browser ([live](https://dguywhoknows.github.io/language-reader/tests/)).

## Project structure

```
index.html           public home page (generated)
login.html           sign-in and sign-up (generated)
app.html             the app: markup for every page
src/app.js           UI, page wiring and event handlers
src/core.js          pure logic with no DOM access (unit-tested)
src/demo.js          sample responses used when no API key is configured
src/lib/ai.js        LLM client: Groq / OpenRouter, streaming, JSON mode, retries
src/lib/dom.js       DOM helpers, namespaced storage, markdown renderer
src/lib/router.js    hash router and the Settings page
src/lib/copilot.js   AI command box that drives the app's own functions
src/lib/auth.js      accounts (Supabase Auth) and the sign-in gate
styles/base.css      design tokens and shared components
styles/app.css       app-specific styles
tests/               unit tests (browser runner + Node runner for CI)
```

## Tech

- Intl.Segmenter
- Web Speech API (speechSynthesis)
- Per-language localStorage vocab stores
- Tokenization (Intl.Segmenter), comprehension, scheduling, cloze, grading and import/export in src/core.js covered by unit tests run in the browser and in CI
- Vanilla JavaScript, no framework or bundler
- Deployed with GitHub Pages

## License

MIT
