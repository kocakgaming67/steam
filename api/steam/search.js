let cachedApps = null;
let cachedAt = 0;

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

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
      appId: String(app.appid),
      gameName: String(app.name)
    }));

  cachedAt = now;
  return cachedApps;
}

function scoreGameName(name, query) {
  const n = name.toLowerCase();
  const q = query.toLowerCase();

  if (n === q) return 1000;
  if (n.startsWith(q)) return 900;
  if (n.includes(q)) return 700;

  const parts = q.split(/\s+/).filter(Boolean);
  let score = 0;

  for (const part of parts) {
    if (n.startsWith(part)) score += 120;
    else if (n.includes(part)) score += 80;
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

    if (q.length < 2) {
      res.status(200).json({ results: [] });
      return;
    }

    const apps = await getAppList();

    const results = apps
      .map(app => ({
        ...app,
        score: scoreGameName(app.gameName, q)
      }))
      .filter(app => app.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.gameName.length - b.gameName.length;
      })
      .slice(0, 12)
      .map(app => ({
        appId: app.appId,
        gameName: app.gameName
      }));

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to search Steam apps',
      error: error.message
    });
  }
};