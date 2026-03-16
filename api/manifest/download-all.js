module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const ids = String(req.query.ids || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^\d+$/.test(s));

  if (!ids.length) {
    res.status(400).send('No valid IDs provided');
    return;
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const baseUrl = `${proto}://${host}`;

  const lines = ids.map(appId =>
    `${appId} - ${baseUrl}/api/manifest/download/${encodeURIComponent(appId)}`
  );

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="manifest_links.txt"');
  res.status(200).send(lines.join('\n'));
};