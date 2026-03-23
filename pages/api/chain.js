// pages/api/chain.js
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key, expiry_date } = req.query;
  if (!instrument_key || !expiry_date) return res.status(400).json({ error: 'Missing params' });

  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instrument_key)}&expiry_date=${expiry_date}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        return res.json({ source: 'upstox', data: d.data || [] });
      }
    } catch {}
  }

  // NSE fallback
  const sym = instrument_key.includes('Bank') ? 'BANKNIFTY'
    : instrument_key.includes('Fin') ? 'FINNIFTY'
    : instrument_key.includes('MidCap') ? 'MIDCPNIFTY'
    : instrument_key.includes('SENSEX') ? 'SENSEX'
    : 'NIFTY';
  try {
    const pf = await fetch('https://www.nseindia.com/option-chain', {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0', Accept: 'text/html' }
    });
    const cookies = pf.headers.get('set-cookie') || '';
    const r = await fetch(`https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0',
        Accept: 'application/json', Referer: 'https://www.nseindia.com/option-chain', Cookie: cookies
      }
    });
    const d = await r.json();
    return res.json({ source: 'nse', nse_raw: d });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
