import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";
import { createRequire } from "module";

dotenv.config();

// ---- Paths ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- pdf-parse (CJS) ----
const require = createRequire(import.meta.url);
const pdfParseMod = require("pdf-parse");
const pdfParse =
  (typeof pdfParseMod === "function" && pdfParseMod) ||
  (typeof pdfParseMod?.default === "function" && pdfParseMod.default) ||
  (typeof pdfParseMod?.pdf === "function" && pdfParseMod.pdf);

if (!pdfParse) {
  console.error("pdf-parse export shape:", pdfParseMod);
  throw new Error("pdf-parse konnte nicht als Funktion geladen werden.");
}

// ---- App ----
const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Landing: / -> index.html (Startseite)
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
// Tool: /tool
app.get("/tool", (req, res) => res.sendFile(path.join(__dirname, "public", "tool.html")));

const PORT = Number(process.env.PORT || 3000);
const IP = "0.0.0.0";
const PROVIDER = (process.env.PROVIDER || "deepseek").toLowerCase(); // deepseek | ollama | demo
const DEMO_MODE = (process.env.DEMO_MODE || "false").toLowerCase() === "true";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 30);
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

console.log("✅ Server starting...");
console.log("PORT:", PORT);
console.log("PROVIDER:", PROVIDER);
console.log("DEMO_MODE:", DEMO_MODE);
console.log("DEEPSEEK KEY loaded?", !!DEEPSEEK_API_KEY);
console.log("MAX_FILE_MB:", MAX_FILE_MB);

// ---- Upload ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES }
});

// ---- Prompt ----
function buildPrompt({ text, textType, level, lang }) {
  const languageInstruction =
    lang === "en"
      ? "Respond in ENGLISH only."
      : "Antworte NUR auf DEUTSCH.";

  const scoreInstruction =
    lang === "en"
      ? "Add an integer score from 1 to 10 (NOT a grade). It reflects clarity, structure, and language quality. Explain the score briefly in 1–2 sentences."
      : "Füge einen ganzzahligen Score von 1 bis 10 hinzu (KEINE Note). Er beschreibt Verständlichkeit, Struktur und sprachliche Qualität. Erkläre den Score kurz in 1–2 Sätzen.";

  const languageIssuesInstruction =
    lang === "en"
      ? "Identify typical grammar issues and spelling issues. Do NOT correct the full text. Provide explanations/patterns and 3–6 bullet points each."
      : "Identifiziere typische Grammatik- und Rechtschreibprobleme. Korrigiere NICHT den gesamten Text. Nenne Muster/Erklärungen und jeweils 3–6 Stichpunkte.";

  return `
You are a feedback coach for student writing.
${languageInstruction}

You must NOT provide a full rewritten solution or a model answer.
You must NOT assign grades (no numeric/letter grade).

Target group/level: ${level}
Text type: ${textType}

Return ONLY valid JSON with this schema:
{
  "score": number,
  "score_explanation": string,
  "strengths": string[],
  "improvements": string[],
  "language_issues": {
    "grammar": string[],
    "spelling": string[]
  },
  "next_steps": string[],
  "mini_exercise": string
}

Rules:
- ${scoreInstruction}
- "score" must be an integer 1..10
- Each list must have 3–6 bullet points
- Be concrete and actionable (structure, coherence, vocabulary, grammar, style)
- ${languageIssuesInstruction}
- Do NOT rewrite the whole text
- If text is too short, explain what is missing and how to expand

Student text:
"""${text}"""
`.trim();
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Output is not valid JSON.");
  }
}

// ---- Demo ----
function demoResponse(lang) {
  if (lang === "en") {
    return {
      score: 7,
      score_explanation:
        "The text is generally clear and structured, but there are some language and style issues that reduce precision.",
      strengths: [
        "The introduction makes the topic clear and sets a direction.",
        "Paragraphs mostly follow a logical flow (one main idea per paragraph).",
        "Some linking words connect ideas effectively."
      ],
      improvements: [
        "Some sentences are too long; split them for clarity.",
        "Vocabulary is sometimes too general; use more precise terms.",
        "Add a clearer conclusion that summarises your main point."
      ],
      language_issues: {
        grammar: [
          "Inconsistent verb tenses in the body paragraphs",
          "Missing articles (a/an/the) in a few places",
          "Some sentences have unclear word order"
        ],
        spelling: [
          "Confusion between there/their in one or two places",
          "Minor spelling mistakes in longer words",
          "Check capitalisation at the start of sentences"
        ]
      },
      next_steps: [
        "Add one counterargument and respond to it briefly.",
        "Replace 3 basic words with more specific vocabulary.",
        "Rewrite your longest sentence into two shorter ones."
      ],
      mini_exercise:
        "Pick 5 sentences and check tense consistency. Then rewrite 2 long sentences into shorter ones."
    };
  }

  return {
    score: 7,
    score_explanation:
      "Der Text ist insgesamt gut verständlich und logisch aufgebaut, aber sprachlich/stilistisch noch nicht durchgehend präzise.",
    strengths: [
      "Die Einleitung macht das Thema klar und gibt eine Richtung vor.",
      "Die Absatzstruktur ist größtenteils logisch (eine Hauptidee pro Absatz).",
      "Teilweise werden passende Konnektoren genutzt, um Gedanken zu verknüpfen."
    ],
    improvements: [
      "Einige Sätze sind sehr lang; teile sie für mehr Klarheit.",
      "Der Wortschatz ist stellenweise zu allgemein – nutze präzisere Begriffe.",
      "Ein klareres Fazit würde den Text stärker abrunden."
    ],
    language_issues: {
      grammar: [
        "Unsichere Kommasetzung bei Nebensätzen",
        "Teilweise falsche Verbposition im Hauptsatz",
        "Uneinheitliche Zeitform im Textverlauf"
      ],
      spelling: [
        "Groß- und Kleinschreibung bei Nomen prüfen",
        "Verwechslung von „das“ und „dass“ möglich",
        "Getrennt- und Zusammenschreibung prüfen"
      ]
    },
    next_steps: [
      "Füge ein Gegenargument ein und entkräfte es kurz.",
      "Ersetze 3 sehr allgemeine Wörter durch präzisere Alternativen.",
      "Formuliere den längsten Satz in zwei kürzere Sätze um."
    ],
    mini_exercise:
      "Markiere 5 Stellen mit Nebensätzen und setze die Kommas korrekt. Danach überprüfe 10 Nomen auf Großschreibung."
  };
}

// ---- File text extraction ----
async function extractTextFromUpload(file) {
  const mime = file.mimetype;

  if (mime === "text/plain") return file.buffer.toString("utf-8");

  if (mime === "application/pdf") {
    const data = await pdfParse(file.buffer);
    return data.text || "";
  }

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || "";
  }

  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
    if (file.size < 30_000) {
      throw new Error("Bild ist zu klein für OCR. Bitte ein größeres/lesbares Bild hochladen.");
    }
    const worker = await createWorker("eng");
    try {
      const { data } = await worker.recognize(file.buffer);
      return data.text || "";
    } finally {
      await worker.terminate();
    }
  }

  throw new Error("Dateityp nicht unterstützt.");
}

// ---- Providers ----
async function callDeepSeek(prompt) {
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY fehlt in .env");

  const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "Return ONLY valid JSON. No markdown. No extra text." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    })
  });

  const data = await r.json();
  if (!r.ok) {
    console.error("DEEPSEEK ERROR:", JSON.stringify(data, null, 2));
    throw new Error("DeepSeek API Fehler (Details im Server-Log).");
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callOllama(prompt) {
  const r = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    })
  });

  if (!r.ok) {
    const t = await r.text();
    console.error("OLLAMA ERROR:", t);
    throw new Error("Ollama Fehler (läuft `ollama serve`?).");
  }

  const data = await r.json();
  return data?.response ?? "";
}

// ---- Multer errors ----
app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `Datei zu groß. Maximal ${MAX_FILE_MB} MB erlaubt.` });
  }
  return next(err);
});

// ---- API ----
app.post("/api/feedback", upload.single("file"), async (req, res) => {
  try {
    const textType = req.body.textType || "Essay";
    const level = req.body.level || "Q1";
    const lang = req.body.lang || "de";

    let text = (req.body.text || "").trim();
    if (req.file) text = (await extractTextFromUpload(req.file)).trim();

    if (!text || text.length < 30) {
      return res.status(400).json({
        error:
          lang === "en"
            ? "Please enter text or upload a file with enough content."
            : "Bitte Text eingeben oder eine Datei mit ausreichend Inhalt hochladen."
      });
    }

    if (DEMO_MODE || PROVIDER === "demo") {
      return res.json(demoResponse(lang));
    }

    const prompt = buildPrompt({ text, textType, level, lang });

    let raw = "";
    if (PROVIDER === "ollama") raw = await callOllama(prompt);
    else raw = await callDeepSeek(prompt);

    let parsed;
    try {
      parsed = tryParseJson(raw);
    } catch {
      return res.status(200).json({
        score: null,
        score_explanation: "",
        strengths: [],
        improvements: [
          lang === "en"
            ? "The model did not return valid JSON."
            : "Die KI-Antwort war nicht im erwarteten JSON-Format.",
          lang === "en"
            ? "Tip: try another model or tighten the prompt."
            : "Tipp: Modell wechseln oder Prompt weiter verschärfen."
        ],
        language_issues: { grammar: [], spelling: [] },
        next_steps: [],
        mini_exercise: raw.slice(0, 900)
      });
    }

    // Defaults
    parsed.score ??= null;
    parsed.score_explanation ??= "";
    parsed.strengths ??= [];
    parsed.improvements ??= [];
    parsed.language_issues ??= { grammar: [], spelling: [] };
    parsed.language_issues.grammar ??= [];
    parsed.language_issues.spelling ??= [];
    parsed.next_steps ??= [];
    parsed.mini_exercise ??= "";

    // Clamp score
    if (typeof parsed.score === "number") {
      parsed.score = Math.max(1, Math.min(10, Math.round(parsed.score)));
    }

    return res.json(parsed);
  } catch (e) {
    console.error("SERVER ERROR:", e);
    return res.status(500).json({
      error: "Serverfehler",
      details: String(e.message || e)
    });
  }
});

app.listen(PORT, IP, () => {
  console.log(`✅ Server läuft: ${IP}:${PORT}`);
});
