// pages/api/all-indices.js
// Fixed: correct NSE_MAP, Yahoo Finance fallback, no cookie caching on serverless

const NSE_MAP = {
  NIFTY:      'NIFTY 50',
  BANKNIFTY:  'NIFTY BANK',
  FINNIFTY:   'NIFTY FIN SERVICE',
  MIDCPNIFTY: 'NIFTY MIDCAP SELECT',
  SENSEX:     'SENSEX',
  BANKEX:     'BANKEX',
};

// Yahoo Finance symbols for each index
const YAHOO_SYMBOLS = {
  NIFTY:      '^NSEI',
  BANKNIFTY:  '^NSEBANK',
  FINNIFTY:   'NIFTY_FIN_SERVICE.NS',
  MIDCPNIFTY: 'NIFTY_MIDCAP_SELECT.NS',
  SENSEX:     '^BSESN',
  BANKEX:     'BSE-BANK.BO',
};

async function fetchNSEIndices() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.nseindia.com/',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Fresh cookies every call (Vercel is stateless)
  const home = await fetch('https://www.nseindia.com', {
    headers: { ...headers, Accept: 'text/html' }
  });
  const cookies = home.headers.get('set-cookie') || '';

  // Also hit the market page to get more cookies
  await fetch('https://www.nseindia.com/market-data/live-equity-market', {
    headers: { ...headers, Accept: 'text/html', Cookie: cookies }
  });

  const r = await fetch('https://www.nseindia.com/api/allIndices', {
    headers: { ...headers, Cookie: cookies }
  });
  if (!r.ok) throw new Error(`NSE ${r.status}`);
  return r.json();
}

async function fetchYahooQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) return null;
    const q = result.indicators?.quote?.[0];
    const meta = result.meta;
    const closes = q?.close?.filter(Boolean) || [];
    if (!closes.length) return null;
    const ltp  = meta.regularMarketPrice || closes[closes.length - 1];
    const prev = closes.length >= 2 ? closes[closes.length - 2] : ltp;
    const chg  = ltp - prev;
    const pct  = prev ? (chg / prev) * 100 : 0;
    return {
      ltp:  Math.round(ltp  * 100) / 100,
      chg:  Math.round(chg  * 100) / 100,
      pct:  Math.round(pct  * 100) / 100,
      high: Math.round((meta.regularMarketDayHigh || ltp) * 100) / 100,
      low:  Math.round((meta.regularMarketDayLow  || ltp) * 100) / 100,
    };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');

  // ── 1. Try Upstox (most accurate, has SENSEX + BANKEX) ──────────────────
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
        const keyMap = {
          'NSE_INDEX|Nifty 50':            'NIFTY',
          'NSE_INDEX|Nifty Bank':          'BANKNIFTY',
          'NSE_INDEX|Nifty Fin Service':   'FINNIFTY',
          'NSE_INDEX|Nifty MidCap Select': 'MIDCPNIFTY',
          'BSE_INDEX|SENSEX':              'SENSEX',
          'BSE_INDEX|BANKEX':              'BANKEX',
        };
        const data = {};
        for (const [k, v] of Object.entries(d.data || {})) {
          // Upstox key format: NSE_INDEX:Nifty%2050 or similar — match flexibly
          for (const [mapKey, idx] of Object.entries(keyMap)) {
            if (k.replace(/%20/g,' ').includes(mapKey.split('|')[1])) {
              data[idx] = { ltp: v.last_price, chg: 0, pct: 0, high: 0, low: 0 };
            }
          }
        }
        if (Object.keys(data).length >= 3) {
          return res.json({ source: 'upstox', data });
        }
      }
    } catch {}
  }

  // ── 2. Try NSE allIndices ────────────────────────────────────────────────
  try {
    const d = await fetchNSEIndices();
    const data = {};
    for (const item of (d.data || [])) {
      const name = (item.index || '').toUpperCase();
      for (const [key, nse] of Object.entries(NSE_MAP)) {
        if (name.includes(nse.toUpperCase())) {
          data[key] = {
            ltp:  parseFloat(item.last        || item.lastPrice     || 0),
            chg:  parseFloat(item.change      || item.variation     || 0),
            pct:  parseFloat(item.percentChange || item.pChange     || 0),
            high: parseFloat(item.high        || 0),
            low:  parseFloat(item.low         || 0),
          };
        }
      }
    }
    if (Object.keys(data).length >= 3) {
      return res.json({ source: 'nse', data });
    }
  } catch {}

  // ── 3. Yahoo Finance fallback (always works) ─────────────────────────────
  try {
    const data = {};
    await Promise.all(
      Object.entries(YAHOO_SYMBOLS).map(async ([key, sym]) => {
        const q = await fetchYahooQuote(sym);
        if (q) data[key] = q;
      })
    );
    if (Object.keys(data).length > 0) {
      return res.json({ source: 'yahoo', data });
    }
  } catch {}

  return res.status(502).json({ error: 'All data sources failed', data: {} });
}
