let cachedApps = null;
let cachedAt = 0;

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 jam

async function getAppList() {
  const now = Date.now();

  if (cachedApps && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedApps;
  }

  const response = await fetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/', {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SteamManifestGenerator/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Steam app list request failed with status ${response.status}`);
  }

  const data = await response.json();
  const apps = data?.applist?.apps || [];

  cachedApps = apps
    .filter(app => app && app.appid && app.name && String(app.name).trim())
    .map(app => ({
      appid: String(app.appid),
      name: String(app.name)
    }));

  cachedAt = now;
  return cachedApps;
}

function scoreResult(name, query) {
  const n = name.toLowerCase();
  const q = query.toLowerCase();

  if (n === q) return 1000;
  if (n.startsWith(q)) return 800;
  if (n.includes(q)) return 500;

  const words = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const word of words) {
    if (n.includes(word)) score += 100;
  }
  return score;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  try {
    const q = String(req.query.q || '').trim();

    if (!q || q.length < 2) {
      res.status(200).json({ results: [] });
      return;
    }

    const apps = await getAppList();

    const results = apps
      .map(app => ({
        ...app,
        score: scoreResult(app.name, q)
      }))
      .filter(app => app.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.length - b.name.length;
      })
      .slice(0, 10)
      .map(app => ({
        appId: app.appid,
        gameName: app.name
      }));

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to search Steam apps',
      error: error.message
    });
  }
};