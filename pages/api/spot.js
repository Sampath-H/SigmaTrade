// pages/api/spot.js
const NSE_INDEX_MAP = {
  'NSE_INDEX|Nifty 50':           'NIFTY 50',
  'NSE_INDEX|Nifty Bank':         'NIFTY BANK',
  'NSE_INDEX|Nifty Fin Service':  'NIFTY FIN SERVICE',
  'NSE_INDEX|Nifty MidCap Select':'NIFTY MIDCAP SELECT',
  'BSE_INDEX|SENSEX':             'SENSEX',
  'BSE_INDEX|BANKEX':             'BANKEX',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key } = req.query;

  // Upstox first
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(instrument_key)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        for (const v of Object.values(d.data || {})) {
          if (v.last_price) return res.json({ source: 'upstox', ltp: v.last_price });
        }
      }
    } catch {}
  }

  // NSE allIndices fallback (works for both NSE and BSE indices)
  const nse_name = NSE_INDEX_MAP[instrument_key];
  if (nse_name) {
    try {
      const home = await fetch('https://www.nseindia.com', {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' }
      });
      const cookies = home.headers.get('set-cookie') || '';
      const r = await fetch('https://www.nseindia.com/api/allIndices', {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0',
          Accept: 'application/json', Referer: 'https://www.nseindia.com/', Cookie: cookies }
      });
      if (r.ok) {
        const d = await r.json();
        const found = (d.data || []).find(i =>
          i.index?.toUpperCase().includes(nse_name.toUpperCase())
        );
        if (found?.last) return res.json({ source: 'nse', ltp: found.last });
      }
    } catch {}
  }

  return res.status(502).json({ error: 'Could not fetch spot' });
}
