// pages/api/expiry.js
const NSE_SYMBOL_MAP = {
  'NSE_INDEX|Nifty 50':           'NIFTY',
  'NSE_INDEX|Nifty Bank':         'BANKNIFTY',
  'NSE_INDEX|Nifty Fin Service':  'FINNIFTY',
  'NSE_INDEX|Nifty MidCap Select':'MIDCPNIFTY',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key } = req.query;

  // Try Upstox
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/option/contract/expiry?instrument_key=${encodeURIComponent(instrument_key)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        if (d.data?.length) return res.json({ source: 'upstox', expiries: d.data });
      }
    } catch {}
  }

  // Try NSE for supported indices
  const sym = NSE_SYMBOL_MAP[instrument_key];
  if (sym) {
    try {
      const home = await fetch('https://www.nseindia.com', {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0', Accept: 'text/html' }
      });
      const cookies = home.headers.get('set-cookie') || '';
      const r = await fetch(
        `https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0', Accept: 'application/json',
            Referer: 'https://www.nseindia.com/option-chain', Cookie: cookies } }
      );
      if (r.ok) {
        const d = await r.json();
        const expiries = (d.records?.expiryDates || []).map(e => {
          try { return new Date(e).toISOString().split('T')[0]; } catch { return e; }
        });
        if (expiries.length) return res.json({ source: 'nse', expiries });
      }
    } catch {}
  }

  // Generate expiries as fallback
  const isBSE = instrument_key?.includes('BSE');
  const weekday = isBSE ? 4 : 2; // Thu=4, Tue=2
  const expiries = [];
  const d = new Date();
  // Start from today
  while (expiries.length < 8) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === weekday) {
      expiries.push(d.toISOString().split('T')[0]);
    }
  }
  return res.json({ source: 'generated', expiries });
}
