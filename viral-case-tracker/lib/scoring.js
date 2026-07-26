function clamp(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(10, num));
}

// youtube_video_count of null means the lookup failed/couldn't run — treat
// that as unknown rather than either "saturated" or "pristine" so a bad
// API call never silently produces a false green light.
function youtubeSaturationScore(count) {
  if (count === null || count === undefined) return null;
  if (count === 0) return 10;
  if (count <= 2) return 7;
  if (count <= 5) return 3;
  return 0;
}

function computeScore({ momentum_score, trigger_freshness_score, story_strength_score, youtube_video_count }) {
  const momentum = clamp(momentum_score);
  const triggerFreshness = clamp(trigger_freshness_score);
  const storyStrength = clamp(story_strength_score);
  const ytScore = youtubeSaturationScore(youtube_video_count);

  if (ytScore === null) {
    return {
      youtube_saturation_score: null,
      composite_score: null,
      verdict: 'needs recheck',
    };
  }

  const composite =
    momentum * 0.3 + triggerFreshness * 0.25 + ytScore * 0.25 + storyStrength * 0.2;

  let verdict;
  if (composite >= 7 && youtube_video_count <= 2) verdict = 'green light';
  else if (composite >= 5) verdict = 'watch';
  else verdict = 'skip';

  return {
    youtube_saturation_score: ytScore,
    composite_score: Math.round(composite * 10) / 10,
    verdict,
  };
}

module.exports = { computeScore, clamp, youtubeSaturationScore };
