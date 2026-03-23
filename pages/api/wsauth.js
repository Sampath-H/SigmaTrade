export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token === 'MOCK_TOKEN') return res.status(401).json({ error: 'No token' });
  try {
    const r = await fetch('https://api.upstox.com/v2/feed/market-data-feed/authorize', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    const d = await r.json();
    const url = d?.data?.authorizedRedirectUri;
    if (!url) throw new Error('No URL');
    return res.json({ url });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
