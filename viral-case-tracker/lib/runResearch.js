const { findCandidateCases } = require('./research');
const { getYoutubeSaturation } = require('./youtube');
const { computeScore } = require('./scoring');
const { upsertCase, logRun } = require('./store');

async function runResearch() {
  const startedAt = new Date().toISOString();
  try {
    const candidates = await findCandidateCases(process.env.GEMINI_API_KEY);

    const finalCases = [];
    for (const candidate of candidates) {
      let ytCount = null;
      let ytVideos = [];
      let ytError = null;

      try {
        const result = await getYoutubeSaturation(candidate.case_name, process.env.YOUTUBE_API_KEY);
        ytCount = result.count;
        ytVideos = result.videos;
      } catch (err) {
        // A failed lookup shouldn't kill the whole run — the case just
        // comes through as "needs recheck" instead of a false score.
        ytError = String(err.message || err);
      }

      const scored = computeScore({ ...candidate, youtube_video_count: ytCount });

      finalCases.push({
        ...candidate,
        ...scored,
        youtube_video_count: ytCount,
        youtube_videos: ytVideos,
        youtube_lookup_error: ytError,
      });
    }

    finalCases.forEach(upsertCase);

    logRun({
      ran_at: startedAt,
      status: 'success',
      cases_found: finalCases.length,
      green_lights: finalCases.filter((c) => c.verdict === 'green light').length,
    });

    return { ok: true, cases: finalCases };
  } catch (err) {
    logRun({
      ran_at: startedAt,
      status: 'error',
      error: String(err.message || err),
    });
    return { ok: false, error: String(err.message || err) };
  }
}

module.exports = { runResearch };
