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

async function fetchOriginalZipBuffer(appId) {
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

  const arrayBuffer = await response.arrayBuffer();

  return {
    ok: true,
    buffer: Buffer.from(arrayBuffer)
  };
}

function sanitizeFileName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
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

    // Batas aman biar tidak terlalu berat di Vercel
    const uniqueIds = [...new Set(ids)].slice(0, 1000);

    const finalZip = new JSZip();
    const readmeLines = [
      'Manifest Bulk Download',
      '',
      'This archive contains extracted files from original manifest ZIP packages.',
      '',
      'Included entries:'
    ];

    let addedCount = 0;
    let readmeAdded = false;

    for (const appId of uniqueIds) {
      const downloaded = await fetchOriginalZipBuffer(appId);

      if (!downloaded.ok) {
        readmeLines.push(`- ${appId}: FAILED (${downloaded.error})`);
        continue;
      }

      let sourceZip;
      try {
        sourceZip = await JSZip.loadAsync(downloaded.buffer);
      } catch {
        readmeLines.push(`- ${appId}: FAILED (Invalid ZIP)`);
        continue;
      }

      const entries = Object.values(sourceZip.files);
      let foundLua = false;

      for (const entry of entries) {
        if (entry.dir) continue;

        const originalName = entry.name.split('/').pop();
        const lowerName = originalName.toLowerCase();

        // ambil semua .lua
        if (lowerName.endsWith('.lua')) {
          const luaBuffer = await entry.async('nodebuffer');
          const finalName = sanitizeFileName(originalName || `${appId}.lua`);
          finalZip.file(finalName, luaBuffer);
          foundLua = true;
          addedCount++;
        }

        // ambil README satu kali saja
        if (!readmeAdded && lowerName === 'readme.txt') {
          const readmeBuffer = await entry.async('nodebuffer');
          finalZip.file('README.txt', readmeBuffer);
          readmeAdded = true;
        }
      }

      if (foundLua) {
        readmeLines.push(`- ${appId}: OK`);
      } else {
        readmeLines.push(`- ${appId}: FAILED (No LUA found)`);
      }
    }

    if (addedCount === 0) {
      res.status(404).send('No LUA files found');
      return;
    }

    // kalau zip asli tidak punya readme sama sekali, bikin fallback
    if (!readmeAdded) {
      finalZip.file('README.txt', readmeLines.join('\n'));
    }

    const buffer = await finalZip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="steam_manifests_flat.zip"');
    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).send(error.message || 'Internal server error');
  }
};
