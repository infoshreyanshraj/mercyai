const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://infoshreyanshraj.github.io";

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
}) : null;

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === FRONTEND_ORIGIN || origin.endsWith(".github.io") || origin.includes("localhost")) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by MERCY API CORS policy."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "32kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use("/api/chat", rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mercy_users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(254) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS mercy_notes (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES mercy_users(id) ON DELETE CASCADE,
      body VARCHAR(5000) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS mercy_notes_user_created_idx ON mercy_notes(user_id, created_at DESC);
  `);
}
function requireSetup(req, res, next) {
  if (!pool || !JWT_SECRET) return res.status(503).json({
    error: "Backend setup incomplete. Configure DATABASE_URL and JWT_SECRET on the hosting service."
  });
  next();
}
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please log in first." });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: "mercy-ai" });
    req.user = { id: String(payload.sub), name: payload.name, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}
const publicUser = row => ({ id: String(row.id), name: row.name, email: row.email });

app.get("/api/health", async (_req, res) => {
  let database = "not-configured";
  if (pool) {
    try { await pool.query("SELECT 1"); database = "connected"; }
    catch { database = "unavailable"; }
  }
  res.json({
    name: "MERCY AI API",
    status: database === "connected" && Boolean(JWT_SECRET) ? "ready" : "setup-required",
    database,
    authConfigured: Boolean(JWT_SECRET),
    time: new Date().toISOString()
  });
});

app.post("/api/auth/signup", requireSetup, async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 200) {
    return res.status(400).json({ error: "Enter a name, valid email, and password of at least 10 characters." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO mercy_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email",
      [name, email, passwordHash]
    );
    const user = publicUser(result.rows[0]);
    const token = jwt.sign({ name: user.name, email: user.email }, JWT_SECRET, {
      subject: user.id, expiresIn: "7d", issuer: "mercy-ai"
    });
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
    console.error("Signup error:", err.message);
    res.status(500).json({ error: "Could not create account. Please try again." });
  }
});

app.post("/api/auth/login", requireSetup, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  try {
    const result = await pool.query("SELECT id,name,email,password_hash FROM mercy_users WHERE email=$1", [email]);
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const user = publicUser(row);
    const token = jwt.sign({ name: user.name, email: user.email }, JWT_SECRET, {
      subject: user.id, expiresIn: "7d", issuer: "mercy-ai"
    });
    res.json({ user, token });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Could not log in. Please try again." });
  }
});

app.get("/api/me", requireSetup, auth, (req, res) => res.json({ user: req.user }));

app.get("/api/notes", requireSetup, auth, async (req, res) => {
  const result = await pool.query(
    "SELECT id,body,created_at FROM mercy_notes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
    [req.user.id]
  );
  res.json({ notes: result.rows });
});
app.post("/api/notes", requireSetup, auth, async (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body || body.length > 5000) return res.status(400).json({ error: "A note must be between 1 and 5000 characters." });
  const result = await pool.query(
    "INSERT INTO mercy_notes(user_id,body) VALUES($1,$2) RETURNING id,body,created_at",
    [req.user.id, body]
  );
  res.status(201).json({ note: result.rows[0] });
});

app.post("/api/chat", requireSetup, auth, async (req, res) => {
  const message = String(req.body.message || "").trim();
  if (!message || message.length > 4000) return res.status(400).json({ error: "Message must be between 1 and 4000 characters." });
  if (!process.env.AI_API_KEY) return res.status(503).json({ error: "AI is not connected yet. Add AI_API_KEY to the backend environment." });
  const endpoint = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are Mercy, a helpful personal AI assistant. Be clear, friendly, and honest." },
          { role: "user", content: message }
        ],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("AI provider returned status", upstream.status);
      return res.status(502).json({ error: "The AI provider request failed. Check backend AI configuration." });
    }
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) return res.status(502).json({ error: "The AI provider returned an empty response." });
    res.json({ reply });
  } catch (err) {
    console.error("AI request error:", err.message);
    res.status(502).json({ error: "Mercy could not reach the AI provider. Please try again." });
  }
});

app.use((err, _req, res, _next) => {
  if (err.message?.includes("CORS")) return res.status(403).json({ error: "This website origin is not allowed." });
  console.error("Unhandled API error:", err.message);
  res.status(500).json({ error: "Unexpected server error." });
});

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`MERCY API listening on port ${PORT}`));
}).catch(err => {
  console.error("Database initialization failed:", err.message);
  process.exit(1);
});