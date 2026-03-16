function buildBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

async function fetchGameName(appId) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&l=english`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SteamManifestGenerator/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Steam request failed with status ${response.status}`);
  }

  const data = await response.json();
  const appData = data?.[appId];

  if (!appData || appData.success !== true || !appData.data?.name) {
    return null;
  }

  return appData.data.name;
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
        try {
          const gameName = await fetchGameName(appId);

          if (!gameName) {
            return {
              appId,
              success: false,
              gameName: '',
              error: 'App ID not found or unavailable on Steam'
            };
          }

          return {
            appId,
            success: true,
            gameName,
            filename: `manifest_${appId}.vdf`,
            downloadUrl: `${baseUrl}/api/manifest/download/${encodeURIComponent(appId)}`
          };
        } catch (error) {
          return {
            appId,
            success: false,
            gameName: '',
            error: error.message || 'Failed to fetch Steam app details'
          };
        }
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