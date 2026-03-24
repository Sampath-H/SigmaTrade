// pages/api/expiry.js
// Fixed: includes today if it's expiry day, correct weekdays per index

const NSE_SYMBOL_MAP = {
  'NSE_INDEX|Nifty 50':            'NIFTY',       // weekly: Thursday (4)
  'NSE_INDEX|Nifty Bank':          'BANKNIFTY',   // weekly: Wednesday (3)
  'NSE_INDEX|Nifty Fin Service':   'FINNIFTY',    // weekly: Tuesday (2)
  'NSE_INDEX|Nifty MidCap Select': 'MIDCPNIFTY',  // weekly: Monday (1)
};

// Upstox weekly expiry weekdays (JS: 0=Sun, 1=Mon, ..., 6=Sat)
const EXPIRY_WEEKDAY = {
  'NSE_INDEX|Nifty 50':            4, // Thursday
  'NSE_INDEX|Nifty Bank':          3, // Wednesday
  'NSE_INDEX|Nifty Fin Service':   2, // Tuesday
  'NSE_INDEX|Nifty MidCap Select': 1, // Monday
  'BSE_INDEX|SENSEX':              4, // Thursday (BSE)
  'BSE_INDEX|BANKEX':              4, // Thursday (BSE)
};

function generateExpiries(instrument_key) {
  const weekday = EXPIRY_WEEKDAY[instrument_key] ?? 4;
  const expiries = [];
  const d = new Date();
  // Set to IST midnight to avoid timezone issues
  d.setHours(0, 0, 0, 0);

  // Check if TODAY is an expiry day — include it
  if (d.getDay() === weekday) {
    expiries.push(d.toISOString().split('T')[0]);
  }

  // Generate next 8 weekly expiries
  const start = new Date(d);
  start.setDate(start.getDate() + 1); // start from tomorrow
  while (expiries.length < 8) {
    if (start.getDay() === weekday) {
      expiries.push(start.toISOString().split('T')[0]);
    }
    start.setDate(start.getDate() + 1);
  }

  // Also add monthly expiry (last Thursday of the month) if not already included
  // This gives at least 4 weekly + monthly options
  return expiries.slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key } = req.query;

  // ── 1. Upstox (most accurate — real exchange expiries) ────────────────
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/option/contract/expiry?instrument_key=${encodeURIComponent(instrument_key)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        if (d.data?.length) {
          // Sort expiries ascending
          const sorted = [...d.data].sort((a, b) => new Date(a) - new Date(b));
          return res.json({ source: 'upstox', expiries: sorted });
        }
      }
    } catch {}
  }

  // ── 2. NSE fallback ───────────────────────────────────────────────────
  const sym = NSE_SYMBOL_MAP[instrument_key];
  if (sym) {
    try {
      const home = await fetch('https://www.nseindia.com', {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0.0.0', Accept: 'text/html' }
      });
      const cookies = home.headers.get('set-cookie') || '';
      const r = await fetch(
        `https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 Chrome/124.0.0.0',
            Accept: 'application/json',
            Referer: 'https://www.nseindia.com/option-chain',
            Cookie: cookies,
          }
        }
      );
      if (r.ok) {
        const d = await r.json();
        const expiries = (d.records?.expiryDates || [])
          .map(e => {
            try { return new Date(e).toISOString().split('T')[0]; } catch { return e; }
          })
          .filter(Boolean)
          .sort((a, b) => new Date(a) - new Date(b));
        if (expiries.length) return res.json({ source: 'nse', expiries });
      }
    } catch {}
  }

  // ── 3. Generated fallback (includes today if expiry day) ──────────────
  const expiries = generateExpiries(instrument_key);
  return res.json({ source: 'generated', expiries });
}
