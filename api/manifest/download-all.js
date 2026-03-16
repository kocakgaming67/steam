const JSZip = require('jszip');

const BASE_URL = 'https://kernelos.org';
const API_URL = 'https://kernelos.org/games/download.php?gen=1&id=';

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

async function fetchOriginalZip(appId) {
  const meta = await fetchManifestMeta(appId);
  if (!meta.ok) {
    return { ok: false, error: meta.error };
  }

  const headers = {
    'User-Agent': 'kernelua-plugin/1.0.0',
    'Accept': 'application/json'
  };

  const response = await fetch(meta.downloadUrl, { headers });

  if (!response.ok) {
    return { ok: false, error: 'Download Error' };
  }

  let fileName = `${appId}.zip`;
  const contentDisposition = response.headers.get('content-disposition') || '';
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);

  if (match?.[1]) {
    fileName = match[1];
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    ok: true,
    fileName,
    buffer: Buffer.from(arrayBuffer)
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => /^\d+$/.test(s));

    if (!ids.length) {
      res.status(400).send('No valid IDs provided');
      return;
    }

    const uniqueIds = [...new Set(ids)].slice(0, 10);
    const zip = new JSZip();
    const readmeLines = [
      'Manifest Bulk Download',
      '',
      'This archive contains original ZIP files fetched from kernelos.org.',
      '',
      'Included files:'
    ];

    let addedCount = 0;

    for (const appId of uniqueIds) {
      const result = await fetchOriginalZip(appId);

      if (!result.ok) {
        readmeLines.push(`- ${appId}: FAILED (${result.error})`);
        continue;
      }

      zip.file(result.fileName, result.buffer);
      readmeLines.push(`- ${appId}: ${result.fileName}`);
      addedCount++;
    }

    if (addedCount === 0) {
      res.status(404).send('No valid manifests found');
      return;
    }

    zip.file('README.txt', readmeLines.join('\n'));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="steam_manifests_bundle.zip"');
    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).send(error.message || 'Internal server error');
  }
};