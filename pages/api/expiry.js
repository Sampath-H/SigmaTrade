// pages/api/expiry.js
// Ported from Python algo_trading.py api_get_expiry_dates + NSE fallback

const NSE_SYMBOL = {
  'NSE_INDEX|Nifty 50':            'NIFTY',
  'NSE_INDEX|Nifty Bank':          'BANKNIFTY',
  'NSE_INDEX|Nifty Fin Service':   'FINNIFTY',
  'NSE_INDEX|Nifty MidCap Select': 'MIDCPNIFTY',
};

// JS weekday numbers: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
const EXPIRY_WEEKDAY = {
  'NSE_INDEX|Nifty 50':            4, // Thursday
  'NSE_INDEX|Nifty Bank':          3, // Wednesday
  'NSE_INDEX|Nifty Fin Service':   2, // Tuesday
  'NSE_INDEX|Nifty MidCap Select': 1, // Monday
  'BSE_INDEX|SENSEX':              4, // Thursday
  'BSE_INDEX|BANKEX':              4, // Thursday
};

function fmtDate(d) {
  try {
    const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                     Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    const [day, mon, year] = d.split('-');
    if (months[mon]) return `${year}-${months[mon]}-${day.padStart(2,'0')}`;
    return new Date(d).toISOString().split('T')[0];
  } catch { return d; }
}

function generateExpiries(instrument_key) {
  const weekday = EXPIRY_WEEKDAY[instrument_key] ?? 4;
  const expiries = [];
  // Use IST date
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  now.setHours(0, 0, 0, 0);

  const cur = new Date(now);
  // Include today if it's expiry weekday
  if (cur.getDay() === weekday) {
    expiries.push(cur.toISOString().split('T')[0]);
  }

  // Generate next 8 weekly expiries starting from tomorrow
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  while (expiries.length < 8) {
    if (next.getDay() === weekday) {
      expiries.push(next.toISOString().split('T')[0]);
    }
    next.setDate(next.getDate() + 1);
  }
  return expiries;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key } = req.query;

  // ── 1. Upstox (same as Python api_get_expiry_dates) ───────────────────
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/option/contract/expiry?instrument_key=${encodeURIComponent(instrument_key)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        const expiries = (d.data || []).sort((a, b) => new Date(a) - new Date(b));
        if (expiries.length) {
          console.log('Upstox expiries:', expiries.slice(0,4));
          return res.json({ source: 'upstox', expiries });
        }
      }
    } catch (e) {
      console.error('Upstox expiry error:', e.message);
    }
  }

  // ── 2. NSE fallback ───────────────────────────────────────────────────
  const sym = NSE_SYMBOL[instrument_key];
  if (sym) {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/',
      };
      const home = await fetch('https://www.nseindia.com', {
        headers: { ...headers, Accept: 'text/html' }
      });
      const cookies = home.headers.get('set-cookie') || '';
      const r = await fetch(
        `https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`,
        { headers: { ...headers, Cookie: cookies } }
      );
      if (r.ok) {
        const d = await r.json();
        const expiries = (d.records?.expiryDates || [])
          .map(fmtDate)
          .filter(Boolean)
          .sort((a, b) => new Date(a) - new Date(b));
        if (expiries.length) {
          console.log('NSE expiries:', expiries.slice(0,4));
          return res.json({ source: 'nse', expiries });
        }
      }
    } catch (e) {
      console.error('NSE expiry error:', e.message);
    }
  }

  // ── 3. Generated (always includes today if expiry day) ────────────────
  const expiries = generateExpiries(instrument_key);
  console.log('Generated expiries:', expiries.slice(0,4));
  return res.json({ source: 'generated', expiries });
}
