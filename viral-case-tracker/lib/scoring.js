function clamp(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(10, num));
}

// Saturation now acts as a MULTIPLIER (0 to 1) on the whole score, not just
// one ingredient in a weighted average. This means a case that's already
// heavily covered on YouTube gets capped low no matter how strong its
// story/momentum/freshness scores are — a great story that's already been
// done 10 times is not an opportunity, it's a missed one.
function saturationMultiplier(count) {
  if (count === null || count === undefined) return null;
  if (count === 0) return 1.0; // pristine, no penalty
  if (count === 1) return 0.75;
  if (count === 2) return 0.55;
  if (count <= 4) return 0.3;
  if (count <= 6) return 0.12;
  if (count <= 9) return 0.04;
  return 0.0; // 10+ existing videos: fully saturated, score to zero
}

function computeScore({ momentum_score, trigger_freshness_score, story_strength_score, youtube_video_count }) {
  const momentum = clamp(momentum_score);
  const triggerFreshness = clamp(trigger_freshness_score);
  const storyStrength = clamp(story_strength_score);
  const multiplier = saturationMultiplier(youtube_video_count);

  if (multiplier === null) {
    return {
      youtube_saturation_score: null,
      composite_score: null,
      verdict: 'needs recheck',
    };
  }

  // Base score from the three qualitative signals only — saturation is
  // applied afterward as a multiplier, not blended in as another weight.
  const baseScore = momentum * 0.4 + triggerFreshness * 0.3 + storyStrength * 0.3;
  const composite = baseScore * multiplier;

  // Bar is intentionally high now: green light requires both a strong
  // underlying story/momentum AND very low existing coverage (0-1 videos).
  let verdict;
  if (composite >= 8 && youtube_video_count <= 1) verdict = 'green light';
  else if (composite >= 5) verdict = 'watch';
  else verdict = 'skip';

  return {
    youtube_saturation_score: Math.round(multiplier * 10 * 10) / 10, // kept 0-10 scale for display compatibility
    composite_score: Math.round(composite * 10) / 10,
    verdict,
  };
}

module.exports = { computeScore, clamp, saturationMultiplier, youtubeSaturationScore: saturationMultiplier };