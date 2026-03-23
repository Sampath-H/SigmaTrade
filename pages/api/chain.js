// pages/api/chain.js
<<<<<<< HEAD
// Fixed: better NSE cookie handling + BSE indices support

const NSE_SYMBOL_MAP = {
  'NSE_INDEX|Nifty 50':           'NIFTY',
  'NSE_INDEX|Nifty Bank':         'BANKNIFTY',
  'NSE_INDEX|Nifty Fin Service':  'FINNIFTY',
  'NSE_INDEX|Nifty MidCap Select':'MIDCPNIFTY',
};

// BSE indices are NOT on NSE — return empty with clear message
const BSE_INDICES = ['BSE_INDEX|SENSEX', 'BSE_INDEX|BANKEX'];

async function getNSEData(sym) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.nseindia.com/',
    'Connection': 'keep-alive',
  };

  // Step 1: get cookies from main page
  const home = await fetch('https://www.nseindia.com', { headers: { ...headers, Accept: 'text/html' } });
  const cookies = home.headers.get('set-cookie') || '';

  // Step 2: hit option-chain page to get additional cookies
  await fetch('https://www.nseindia.com/option-chain', {
    headers: { ...headers, Cookie: cookies, Accept: 'text/html' }
  });

  // Step 3: fetch actual data
  const r = await fetch(
    `https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`,
    { headers: { ...headers, Cookie: cookies } }
  );
  if (!r.ok) throw new Error(`NSE ${r.status}`);
  return r.json();
}

=======
>>>>>>> 7dc49498fac3f7d626dd538895dd11d21fa5fdca
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key, expiry_date } = req.query;
<<<<<<< HEAD

  if (!instrument_key || !expiry_date)
    return res.status(400).json({ error: 'Missing params' });

  // BSE indices — NSE doesn't have option chain for them
  if (BSE_INDICES.includes(instrument_key)) {
    return res.json({ source: 'unavailable', data: [],
      message: 'BSE option chain not available via NSE API. Connect Upstox for live BSE data.' });
  }

  // Try Upstox first (if token available)
=======
  if (!instrument_key || !expiry_date) return res.status(400).json({ error: 'Missing params' });

>>>>>>> 7dc49498fac3f7d626dd538895dd11d21fa5fdca
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instrument_key)}&expiry_date=${expiry_date}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
<<<<<<< HEAD
        if (d.data?.length) return res.json({ source: 'upstox', data: d.data });
=======
        return res.json({ source: 'upstox', data: d.data || [] });
>>>>>>> 7dc49498fac3f7d626dd538895dd11d21fa5fdca
      }
    } catch {}
  }

  // NSE fallback
<<<<<<< HEAD
  const sym = NSE_SYMBOL_MAP[instrument_key];
  if (!sym) return res.status(400).json({ error: `Unknown index: ${instrument_key}` });

  try {
    const d = await getNSEData(sym);
    return res.json({ source: 'nse', nse_raw: d });
  } catch (e) {
    return res.status(502).json({ error: `NSE fetch failed: ${e.message}` });
=======
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
>>>>>>> 7dc49498fac3f7d626dd538895dd11d21fa5fdca
  }
}
