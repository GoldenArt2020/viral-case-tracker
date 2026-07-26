const { clamp } = require('./scoring');

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function buildPrompt() {
  return `You are a research analyst for a true crime YouTube operation. Your job is to find US homicide cases (any case involving a killing — murder, manslaughter, suspicious death ruled a homicide) that are gaining public attention RIGHT NOW.

Use Google Search to find real, current information. Do not invent cases or details.

Search for things like:
- US homicide cases with a new development in the last 14 days (arrest, charges filed, trial date set, new evidence, body found, viral social media moment, local news breaking)
- Rising Reddit threads in r/TrueCrime, r/UnresolvedMysteries, r/CrimeJunkiePodcast about a specific case
- Local news coverage of a killing that has started spreading beyond the local market

Do not worry about how much YouTube coverage a case already has — that gets checked separately downstream with the real YouTube API. Just find cases with genuinely rising real-world attention.

Find between 3 and 8 candidate cases if they exist. It is fine to return fewer if you genuinely cannot find good candidates — do not pad the list with weak or stale cases.

For each case, score these on a 0-10 scale:
- momentum_score: how fast is public/search/news interest rising right now (0 = flat, 10 = clearly breaking out)
- trigger_freshness_score: how recent and significant is the news trigger (0 = old news, 10 = happened in the last few days and is significant)
- story_strength_score: how strong are the narrative hooks a true crime audience responds to — mystery, injustice, twist, sympathetic victim, unusual method, unresolved questions (0 = flat/routine, 10 = highly compelling)

Respond with ONLY a raw JSON array, no markdown code fences, no commentary before or after. Each element must have exactly this shape:

[
  {
    "case_name": "string — victim and/or suspect name, whatever is most identifiable",
    "location": "City, State",
    "summary": "2-3 sentence neutral factual summary of the case",
    "trigger_event": "what just happened that is driving new attention",
    "trigger_date": "approximate date of the trigger event, e.g. 2026-07-20",
    "momentum_score": 0,
    "trigger_freshness_score": 0,
    "story_strength_score": 0,
    "sources": ["https://...", "https://..."]
  }
]

If you cannot find any qualifying cases, respond with an empty JSON array: []`;
}

// Normalizes a raw Gemini candidate into a clean shape. Composite scoring
// happens later, in scoring.js, once we have a real YouTube count.
function cleanCandidate(raw) {
  return {
    case_name: raw.case_name || 'Unknown case',
    location: raw.location || '',
    summary: raw.summary || '',
    trigger_event: raw.trigger_event || '',
    trigger_date: raw.trigger_date || '',
    momentum_score: clamp(raw.momentum_score),
    trigger_freshness_score: clamp(raw.trigger_freshness_score),
    story_strength_score: clamp(raw.story_strength_score),
    sources: Array.isArray(raw.sources) ? raw.sources.slice(0, 8) : [],
  };
}

// Gemini sometimes wraps JSON in ```json fences or adds a stray sentence
// despite instructions — strip fences and grab the first [...] block.
function extractJsonArray(text) {
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON array found in Gemini response');
  }
  return JSON.parse(stripped.slice(start, end + 1));
}

async function findCandidateCases(apiKey) {
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  const body = {
    contents: [{ parts: [{ text: buildPrompt() }] }],
    tools: [{ google_search: {} }],
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('\n');

  if (!text.trim()) {
    throw new Error('Gemini returned no text content');
  }

  const rawCases = extractJsonArray(text);
  return rawCases.map(cleanCandidate);
}

module.exports = { findCandidateCases, buildPrompt };
