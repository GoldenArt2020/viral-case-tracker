const { clamp } = require('./scoring');

const TAVILY_URL = 'https://api.tavily.com/search';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SEARCH_QUERIES = [
  'US homicide case new development arrest charges filed last 14 days',
  'true crime case going viral reddit r/TrueCrime new development',
  'local news homicide case suspicious death spreading national attention',
  'murder case new evidence body found trial date set this week',
];

async function tavilySearch(query, apiKey) {
  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: 6,
      days: 14,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Tavily API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
  }));
}

async function gatherSearchResults(tavilyKey) {
  const all = [];
  for (const query of SEARCH_QUERIES) {
    try {
      const results = await tavilySearch(query, tavilyKey);
      all.push({ query, results });
    } catch (err) {
      all.push({ query, results: [], error: String(err.message || err) });
    }
  }
  return all;
}

function buildPrompt(searchBundles) {
  const context = searchBundles
    .map((bundle) => {
      const lines = bundle.results
        .map((r, i) => `  [${i + 1}] ${r.title}\n      URL: ${r.url}\n      ${(r.content || '').slice(0, 500)}`)
        .join('\n');
      return `Search: "${bundle.query}"\n${lines || '  (no results)'}`;
    })
    .join('\n\n');

  return `You are a research analyst for a true crime YouTube operation. Below are real, current web search results about US homicide cases. Your job is to identify which of these describe real cases with genuinely rising public attention right now, and extract structured data about them.

Do not invent cases or details not present in the search results below. Only use what's actually in the results.

IMPORTANT: If multiple search results describe the same real-world case or event, merge them into ONE entry — do not create separate entries for the same case just because it was phrased differently across sources or search queries. Before finalizing your list, check it yourself for any two entries that could plausibly be the same person, victim, or case, and merge them if so.

SEARCH RESULTS:
${context}

Find between 3 and 8 candidate cases if they genuinely exist in the results above. It is fine to return fewer if the results don't support that many — do not pad the list with weak or stale cases, and do not fabricate cases not present above.

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

If none of the search results describe qualifying cases, respond with an empty JSON array: []`;
}

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

function extractJsonArray(text) {
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON array found in Groq response');
  }
  return JSON.parse(stripped.slice(start, end + 1));
}

async function askGroq(prompt, apiKey) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text.trim()) {
    throw new Error('Groq returned no text content');
  }
  return text;
}

async function findCandidateCases(tavilyKey, groqKey) {
  if (!tavilyKey) {
    throw new Error(`Missing TAVILY_API_KEY (received type: ${typeof tavilyKey}, value: ${JSON.stringify(tavilyKey)})`);
  }
  if (!groqKey) {
    throw new Error(`Missing GROQ_API_KEY (received type: ${typeof groqKey}, value: ${JSON.stringify(groqKey)})`);
  }

  const searchBundles = await gatherSearchResults(tavilyKey);
  const prompt = buildPrompt(searchBundles);
  const text = await askGroq(prompt, groqKey);
  const rawCases = extractJsonArray(text);
  return rawCases.map(cleanCandidate);
}

module.exports = { findCandidateCases, buildPrompt };