# CLAUDE.md — AI Assistant Guide for feedback-projekt

## Project Overview

**feedback-projekt** (package name: `feedback-coach`) is a Node.js web application that provides automated, constructive writing feedback for students. It accepts essays and other text types, analyzes them via an AI backend, and returns structured feedback with scores, strengths, improvements, grammar notes, and exercises.

The tool is intentionally positioned as a learning aid — not a grading replacement. It uses a 1–10 orientation score rather than school grades.

**Language context:** The project's README, UI, and default feedback output are in German. English output is supported via a `lang` parameter.

---

## Repository Structure

```
feedback-projekt/
├── server.js           # Main Express server — all backend logic (415 lines)
├── public/
│   ├── index.html      # Landing page (German marketing copy)
│   └── tool.html       # Interactive feedback tool UI (331 lines)
├── eng.traineddata     # Tesseract.js OCR model data (5MB, do not modify)
├── package.json        # ES module project, single script: "start"
├── package-lock.json   # Locked dependency versions
├── .env                # Local environment config (not committed to VCS)
└── README.md           # German project description
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES modules — `"type": "module"`) |
| Web framework | Express 4.22.1 |
| File uploads | multer (memory storage) |
| PDF parsing | pdf-parse |
| DOCX parsing | mammoth |
| Image OCR | tesseract.js 5 with `eng.traineddata` |
| Styling | Tailwind CSS 4.x via CDN |
| AI (cloud) | DeepSeek API (`deepseek-chat`, temp 0.3) |
| AI (local) | Ollama HTTP API |
| Config | dotenv |

---

## Environment Variables

Configured via `.env` file (see `.env` for current values):

| Variable | Default | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | Required for DeepSeek provider |
| `PORT` | `3000` | HTTP server port |
| `PROVIDER` | `"deepseek"` | AI backend: `"deepseek"`, `"ollama"`, or `"demo"` |
| `DEMO_MODE` | `false` | Return hard-coded demo responses (no API calls) |
| `OLLAMA_MODEL` | `"mistral"` | Model name when using Ollama |
| `MAX_FILE_MB` | `30` | Maximum upload file size |

---

## Running the Project

```bash
npm install   # Install dependencies
npm start     # Start server (node server.js) on PORT (default 3000)
```

There is no dev/watch mode, no build step, and no test runner. The server must be restarted manually after changes to `server.js`.

---

## API

### `POST /api/feedback`

Accepts `multipart/form-data`:

| Field | Required | Description |
|---|---|---|
| `textType` | Yes | One of: `Aufsatz`, `Kommentar`, `Analyse`, `Erörterung`, `Zusammenfassung`, `Charakterisierung` |
| `level` | Yes | Education level: `EF`, `Q1`, or `Q2` |
| `lang` | Yes | Output language: `de` or `en` |
| `text` | Conditional | Direct text input (used if no file) |
| `file` | Conditional | Upload file: `.txt`, `.pdf`, `.docx`, `.png`, `.jpeg`, `.webp` |

**Response (200):**
```json
{
  "score": 7,
  "score_explanation": "...",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "language_issues": {
    "grammar": ["..."],
    "spelling": ["..."]
  },
  "next_steps": ["...", "..."],
  "mini_exercise": "..."
}
```

**Error responses:** `400` (insufficient text), `413` (file too large), `500` (AI/parse failure).

---

## Key Code Conventions

### ES Modules
The project uses `"type": "module"` — always use `import`/`export`, never `require()`.

### AI Integration Pattern
- The AI is called with a strict system prompt: `"Return ONLY valid JSON. No markdown. No extra text."`
- User prompt includes: language instructions, education level, text type, JSON schema, and scoring rubric
- Temperature is fixed at `0.3` for consistent responses
- JSON response is parsed with `.trim()` and validated; score is clamped to 1–10

When modifying the AI prompt or response schema, update **both** the prompt in `server.js` and the frontend rendering logic in `tool.html`.

### File Processing Pipeline (server.js)
1. `multer` reads file into memory (`req.file.buffer`)
2. Based on `mimetype`, one of these extractors runs:
   - `pdf-parse` for PDFs
   - `mammoth.extractRawText` for DOCX
   - `tesseract.js` worker for images
   - `.toString()` for plain text
3. Extracted text is passed to the AI prompt builder

### Frontend (tool.html)
- Pure vanilla JS — no framework, no build step
- Sends `FormData` to `/api/feedback` via `fetch`
- Parses JSON response and renders into pre-defined HTML sections
- Supports drag-and-drop file upload and direct text entry

---

## Adding a New Text Type

1. Add the new option to the `<select>` in `public/tool.html`
2. Add a German label mapping in the JS label object in `tool.html` (if applicable)
3. Add evaluation criteria for the new type inside the prompt builder in `server.js`
4. Update `README.md` to list the new type

## Adding a New AI Provider

1. Add a new branch in the provider selection block in `server.js`
2. Accept a new value for the `PROVIDER` environment variable
3. Document the new `PROVIDER` value and any required env vars in this file and in `README.md`

---

## No Testing Infrastructure

There are no automated tests, no test runner, and no CI/CD pipelines. All verification is manual via the web UI. If adding tests, consider using Node's built-in `node:test` module or `vitest` (compatible with ES modules).

---

## Important Files to Know

| File | Why It Matters |
|---|---|
| `server.js:1–50` | Express setup, env config, multer config |
| `server.js:~80–200` | File extraction handlers (PDF, DOCX, OCR, text) |
| `server.js:~200–350` | AI prompt builder and provider calls |
| `server.js:~350–415` | JSON parsing, validation, response |
| `public/tool.html:~240–331` | Frontend JS: form submit, response rendering |

---

## Git Workflow

- Default working branch for AI-assisted development: `claude/add-claude-documentation-YdjzD`
- Commit messages should be concise and descriptive in English
- Push with: `git push -u origin <branch-name>`
- There are no pre-commit hooks or linting enforced

---

## Out of Scope / Do Not Change

- `eng.traineddata` — binary OCR model file, never modify or regenerate
- `package-lock.json` — only update via `npm install`, never edit manually
- The deliberate absence of school grades (1–6) in the scoring system — this is by design
