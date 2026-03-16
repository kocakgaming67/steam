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

function buildManifestContent(appId, gameName) {
  return `"AppState"
{
\t"appid"\t\t"${appId}"
\t"Universe"\t\t"1"
\t"name"\t\t"${gameName}"
\t"StateFlags"\t\t"4"
\t"installdir"\t\t"common/app_${appId}"
\t"SizeOnDisk"\t\t"0"
\t"buildid"\t\t"0"
\t"BytesToDownload"\t\t"0"
\t"BytesDownloaded"\t\t"0"
}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const appId = String(req.query.appId || '').trim();

    if (!/^\d+$/.test(appId)) {
      res.status(400).send('Invalid App ID');
      return;
    }

    const gameName = await fetchGameName(appId);

    if (!gameName) {
      res.status(404).send('Manifest not found');
      return;
    }

    const content = buildManifestContent(appId, gameName);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="manifest_${appId}.vdf"`);
    res.status(200).send(content);
  } catch (error) {
    res.status(500).send(error.message || 'Internal server error');
  }
};