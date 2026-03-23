// pages/api/all-indices.js
const NSE_MAP = {
  NIFTY:      'NIFTY 50',
  BANKNIFTY:  'NIFTY BANK',
  FINNIFTY:   'NIFTY FIN SERVICE',
  MIDCPNIFTY: 'NIFTY MIDCAP SELECT',
  SENSEX:     'SENSEX',
  BANKEX:     'INDIA VIX',
};

let _cookies = '';
let _cookieTime = 0;

async function getNSECookies() {
  if (_cookies && Date.now() - _cookieTime < 5 * 60 * 1000) return _cookies;
  try {
    const r = await fetch('https://www.nseindia.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36', Accept: 'text/html' }
    });
    _cookies = r.headers.get('set-cookie') || '';
    _cookieTime = Date.now();
    return _cookies;
  } catch { return ''; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');

  // Try Upstox for all indices if token available
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const keys = [
        'NSE_INDEX|Nifty 50', 'NSE_INDEX|Nifty Bank', 'NSE_INDEX|Nifty Fin Service',
        'NSE_INDEX|Nifty MidCap Select', 'BSE_INDEX|SENSEX', 'BSE_INDEX|BANKEX'
      ].join(',');
      const r = await fetch(
        `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(keys)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        const data = {};
        const keyMap = {
          'NSE_INDEX|Nifty 50':           'NIFTY',
          'NSE_INDEX|Nifty Bank':         'BANKNIFTY',
          'NSE_INDEX|Nifty Fin Service':  'FINNIFTY',
          'NSE_INDEX|Nifty MidCap Select':'MIDCPNIFTY',
          'BSE_INDEX|SENSEX':             'SENSEX',
          'BSE_INDEX|BANKEX':             'BANKEX',
        };
        for (const [k, v] of Object.entries(d.data || {})) {
          const idx = keyMap[k];
          if (idx) data[idx] = { ltp: v.last_price, chg: 0, pct: 0 };
        }
        return res.json({ source: 'upstox', data });
      }
    } catch {}
  }

  // NSE fallback
  try {
    const cookies = await getNSECookies();
    const r = await fetch('https://www.nseindia.com/api/allIndices', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json', Referer: 'https://www.nseindia.com/', Cookie: cookies,
      }
    });
    if (!r.ok) throw new Error(`NSE ${r.status}`);
    const d = await r.json();
    const data = {};
    for (const item of (d.data || [])) {
      const name = item.index?.toUpperCase();
      for (const [key, nse] of Object.entries(NSE_MAP)) {
        if (name?.includes(nse.toUpperCase())) {
          data[key] = {
            ltp:  parseFloat(item.last || item.lastPrice || 0),
            chg:  parseFloat(item.change || item.variation || 0),
            pct:  parseFloat(item.percentChange || item.pChange || 0),
            high: parseFloat(item.high || 0),
            low:  parseFloat(item.low  || 0),
          };
        }
      }
    }
    return res.json({ source: 'nse', data });
  } catch (e) {
    return res.status(502).json({ error: e.message, data: {} });
  }
}
