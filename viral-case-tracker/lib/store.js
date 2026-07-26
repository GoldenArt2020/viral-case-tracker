const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ cases: [], runs: [] }, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Corrupt file — back it up and start fresh rather than crash the app.
    fs.renameSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now());
    return { cases: [], runs: [] };
  }
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getAllCases() {
  return readDb().cases.sort((a, b) => b.composite_score - a.composite_score);
}

function getRuns() {
  return readDb().runs.sort((a, b) => new Date(b.ran_at) - new Date(a.ran_at));
}

// Insert a case, or update it in place if we've seen it before (same slug).
// Keeps a short history of score changes so you can see a case's momentum
// building across multiple research runs instead of just the latest snapshot.
function upsertCase(caseObj) {
  const db = readDb();
  const key = slugify(`${caseObj.case_name}-${caseObj.location || ''}`);
  const existingIndex = db.cases.findIndex((c) => c.key === key);

  const now = new Date().toISOString();
  const scoreSnapshot = {
    checked_at: now,
    composite_score: caseObj.composite_score,
    youtube_video_count: caseObj.youtube_video_count,
    verdict: caseObj.verdict,
  };

  if (existingIndex === -1) {
    db.cases.push({
      ...caseObj,
      key,
      first_seen_at: now,
      last_checked_at: now,
      history: [scoreSnapshot],
    });
  } else {
    const existing = db.cases[existingIndex];
    db.cases[existingIndex] = {
      ...existing,
      ...caseObj,
      key,
      first_seen_at: existing.first_seen_at,
      last_checked_at: now,
      history: [...(existing.history || []), scoreSnapshot].slice(-30),
    };
  }

  writeDb(db);
  return key;
}

function logRun(runObj) {
  const db = readDb();
  db.runs.push(runObj);
  db.runs = db.runs.slice(-100); // keep last 100 runs
  writeDb(db);
}

function deleteCase(key) {
  const db = readDb();
  db.cases = db.cases.filter((c) => c.key !== key);
  writeDb(db);
}

module.exports = { getAllCases, getRuns, upsertCase, logRun, deleteCase, slugify };
