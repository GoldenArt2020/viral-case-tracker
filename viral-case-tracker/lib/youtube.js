const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

// Heuristic filter for mainstream news outlets and local news affiliates.
// This is deliberately conservative and editable — the goal is to exclude
// daily-news-roundup coverage, not every legitimate crime channel.
const NEWS_CHANNEL_PATTERNS = [
  /\bnews\b/i,
  /^(abc|cbs|nbc|fox|cnn|nbc news|cbs news|abc news)\b/i,
  /eyewitness/i,
  /action news/i,
  /\b(wsb|wjla|wfaa|kron|ktla|whdh|wcvb|wgn|kdka|kfor)\b/i, // common US local affiliate call signs
  /\blocal\s?\d{1,2}\b/i,
  /\bchannel\s?\d{1,2}\b/i,
];

// Minimum video length to count as a "dedicated" case video rather than a
// quick news clip. ISO 8601 duration, e.g. "PT4M32S".
const MIN_DURATION_SECONDS = 4 * 60;

function isLikelyNewsChannel(channelTitle) {
  return NEWS_CHANNEL_PATTERNS.some((re) => re.test(channelTitle || ''));
}

function parseIso8601Duration(duration) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration || '');
  if (!match) return 0;
  const [, h, m, s] = match;
  return (parseInt(h || 0, 10) * 3600) + (parseInt(m || 0, 10) * 60) + parseInt(s || 0, 10);
}

async function getYoutubeSaturation(caseName, apiKey) {
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY');

  const searchParams = new URLSearchParams({
    key: apiKey,
    part: 'snippet',
    type: 'video',
    order: 'relevance',
    maxResults: '25',
    q: `${caseName} true crime case`,
  });

  const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`);
  if (!searchRes.ok) {
    const errText = await searchRes.text().catch(() => '');
    throw new Error(`YouTube search.list error ${searchRes.status}: ${errText}`);
  }
  const searchData = await searchRes.json();
  const items = searchData.items || [];

  // If YouTube's raw search returned exactly the max we asked for, there
  // may well be even more coverage beyond what we fetched — the count
  // below is a floor ("at least this many"), not a guaranteed exact total.
  const hitResultCeiling = items.length >= 25;

  // Filter out obvious news-outlet uploads before spending a videos.list
  // call on duration checks.
  const candidates = items.filter((item) => !isLikelyNewsChannel(item.snippet?.channelTitle));
  if (candidates.length === 0) {
    return { count: 0, videos: [], capped: false };
  }

  const ids = candidates.map((item) => item.id.videoId).filter(Boolean);
  const videosParams = new URLSearchParams({
    key: apiKey,
    part: 'contentDetails,snippet',
    id: ids.join(','),
  });

  const videosRes = await fetch(`${VIDEOS_URL}?${videosParams}`);
  if (!videosRes.ok) {
    const errText = await videosRes.text().catch(() => '');
    throw new Error(`YouTube videos.list error ${videosRes.status}: ${errText}`);
  }
  const videosData = await videosRes.json();

  const dedicated = (videosData.items || [])
    .filter((v) => parseIso8601Duration(v.contentDetails?.duration) >= MIN_DURATION_SECONDS)
    .map((v) => ({
      title: v.snippet?.title,
      channelTitle: v.snippet?.channelTitle,
      publishedAt: v.snippet?.publishedAt,
      url: `https://www.youtube.com/watch?v=${v.id}`,
    }));

  return { count: dedicated.length, videos: dedicated, capped: hitResultCeiling };
}

module.exports = { getYoutubeSaturation, isLikelyNewsChannel, parseIso8601Duration };