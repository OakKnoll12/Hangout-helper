import express from "express";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- DB ---
const db = new Database("hangout.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,   -- YYYY-MM-DD
  end_date TEXT NOT NULL,     -- YYYY-MM-DD
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS responses (
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unavailable_json TEXT NOT NULL,  -- JSON array of YYYY-MM-DD strings
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, name),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
`);

// --- Un-guessable multi-word ID ---
const WORDS = [
  "ember","falcon","plum","violet","orbit","river","thunder","cinder","puzzle","lumen","hazel","comet","atlas","raven",
  "mango","cedar","opal","breeze","quantum","saffron","zenith","pickle","marble","anchor","lantern","kestrel","glacier",
  "squid","pepper","nectar","spruce","jigsaw","cobalt","fjord","tulip","aurora","socket","crystal","mosaic","pirate",
  "canyon","whisper","rocket","basil","matrix","copper","plasma","fable","cashew","goblin","vortex","sugar","radar",
  "cactus","magnet","tiger","kiwi","octane","sphinx","dragon","sailor","waffle","ripple","velvet","banjo","scooter"
];

function randomWord() {
  const idx = crypto.randomInt(0, WORDS.length);
  return WORDS[idx];
}

function makeEventId() {
  // 3 words + 8 chars base32-ish token = very hard to guess
  const token = crypto.randomBytes(5).toString("base64url").toUpperCase(); // ~8 chars
  return `${randomWord()}-${randomWord()}-${randomWord()}-${token}`;
}

function nowIso() {
  return new Date().toISOString();
}

// --- API ---
app.post("/api/events", (req, res) => {
  const { title, startDate, endDate } = req.body || {};
  if (!title || !startDate || !endDate) {
    return res.status(400).json({ error: "title, startDate, endDate required" });
  }

  let id = makeEventId();
  // ensure uniqueness
  const exists = db.prepare("SELECT 1 FROM events WHERE id = ?").get(id);
  if (exists) id = makeEventId();

  db.prepare(
    "INSERT INTO events (id, title, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, title, startDate, endDate, nowIso());

  res.json({ id });
});

app.get("/api/events/:id", (req, res) => {
  const { id } = req.params;
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const responses = db.prepare("SELECT name, unavailable_json, updated_at FROM responses WHERE event_id = ?").all(id);
  res.json({
    event: {
      id: event.id,
      title: event.title,
      startDate: event.start_date,
      endDate: event.end_date
    },
    responses: responses.map(r => ({
      name: r.name,
      unavailable: JSON.parse(r.unavailable_json),
      updatedAt: r.updated_at
    }))
  });
});

app.post("/api/events/:id/submit", (req, res) => {
  const { id } = req.params;
  const { name, unavailableDates } = req.body || {};

  const event = db.prepare("SELECT 1 FROM events WHERE id = ?").get(id);
  if (!event) return res.status(404).json({ error: "Event not found" });

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name required" });
  }
  if (!Array.isArray(unavailableDates)) {
    return res.status(400).json({ error: "unavailableDates must be an array" });
  }

  const unavailable_json = JSON.stringify([...new Set(unavailableDates)].sort());
  const updated_at = nowIso();

  db.prepare(`
    INSERT INTO responses (event_id, name, unavailable_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(event_id, name) DO UPDATE SET
      unavailable_json = excluded.unavailable_json,
      updated_at = excluded.updated_at
  `).run(id, name.trim(), unavailable_json, updated_at);

  res.json({ ok: true });
});

app.get("/api/events/:id/summary", (req, res) => {
  const { id } = req.params;

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const rows = db.prepare("SELECT name, unavailable_json FROM responses WHERE event_id = ?").all(id);
  const responses = rows.map(r => ({ name: r.name, unavailable: JSON.parse(r.unavailable_json) }));

  res.json({
    event: { id, title: event.title, startDate: event.start_date, endDate: event.end_date },
    responses
  });
});

// --- start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hangout planner running on http://localhost:${PORT}`);
});
