const BASE_URL = 'https://kernelos.org';
const API_URL = 'https://kernelos.org/games/download.php?gen=1&id=';

async function fetchManifestMeta(appId) {
  const headers = {
    'User-Agent': 'kernelua-plugin/1.0.0',
    'Accept': 'application/json'
  };

  const response = await fetch(`${API_URL}${encodeURIComponent(appId)}`, { headers });

  if (!response.ok) {
    throw new Error('API Error');
  }

  const data = await response.json();
  let downloadUrl = data?.url;

  if (!downloadUrl) {
    throw new Error('No URL');
  }

  if (downloadUrl.startsWith('/')) {
    downloadUrl = BASE_URL + downloadUrl;
  }

  return downloadUrl;
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

    const headers = {
      'User-Agent': 'kernelua-plugin/1.0.0',
      'Accept': 'application/json'
    };

    const downloadUrl = await fetchManifestMeta(appId);

    const downloadResponse = await fetch(downloadUrl, { headers });

    if (!downloadResponse.ok) {
      res.status(502).send('Download Error');
      return;
    }

    let fileName = `${appId}.zip`;
    const contentDisposition = downloadResponse.headers.get('content-disposition') || '';

    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (match?.[1]) {
      fileName = match[1];
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', downloadResponse.headers.get('content-type') || 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).send(error.message || 'Internal server error');
  }
};