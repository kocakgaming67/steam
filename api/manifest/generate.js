const BASE_URL = 'https://kernelos.org';
const API_URL = 'https://kernelos.org/games/download.php?gen=1&id=';
const STEAM_API_URL = 'https://store.steampowered.com/api/appdetails?appids=';

function buildBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

async function getGameName(appId) {
  try {
    const response = await fetch(`${STEAM_API_URL}${encodeURIComponent(appId)}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'kernelua-plugin/1.0.0'
      }
    });

    if (!response.ok) {
      return `AppID ${appId}`;
    }

    const data = await response.json();
    return data?.[String(appId)]?.data?.name || `AppID ${appId}`;
  } catch {
    return `AppID ${appId}`;
  }
}

async function fetchManifestMeta(appId) {
  const headers = {
    'User-Agent': 'kernelua-plugin/1.0.0',
    'Accept': 'application/json'
  };

  const response = await fetch(`${API_URL}${encodeURIComponent(appId)}`, { headers });

  if (!response.ok) {
    return { ok: false, error: 'API Error' };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: 'Invalid API response' };
  }

  let downloadUrl = data?.url;
  if (!downloadUrl) {
    return { ok: false, error: 'No URL' };
  }

  if (downloadUrl.startsWith('/')) {
    downloadUrl = BASE_URL + downloadUrl;
  }

  return {
    ok: true,
    downloadUrl
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const appIds = Array.isArray(body?.appIds) ? body.appIds : null;

    if (!appIds) {
      res.status(400).json({ message: 'appIds must be an array' });
      return;
    }

    const uniqueIds = [...new Set(
      appIds.map(v => String(v).trim()).filter(v => /^\d+$/.test(v))
    )];

    if (!uniqueIds.length) {
      res.status(400).json({ message: 'No valid numeric App IDs provided' });
      return;
    }

    const baseUrl = buildBaseUrl(req);

    const results = await Promise.all(
      uniqueIds.map(async (appId) => {
        const [gameName, manifestMeta] = await Promise.all([
          getGameName(appId),
          fetchManifestMeta(appId)
        ]);

        if (!manifestMeta.ok) {
          return {
            appId,
            success: false,
            gameName,
            error: manifestMeta.error
          };
        }

        return {
          appId,
          success: true,
          gameName,
          filename: `${appId}.zip`,
          downloadUrl: `${baseUrl}/api/manifest/download/${encodeURIComponent(appId)}`
        };
      })
    );

    const successIds = results.filter(r => r.success).map(r => r.appId);

    res.status(200).json({
      results,
      total: results.length,
      successCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      bulkDownloadUrl: successIds.length
        ? `${baseUrl}/api/manifest/download-all?ids=${encodeURIComponent(successIds.join(','))}`
        : null
    });
  } catch (error) {
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};