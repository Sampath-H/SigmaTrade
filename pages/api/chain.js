// pages/api/chain.js
// Fixed: NSE cookie handling + BSE support + Yahoo Finance fallback

const NSE_SYMBOL_MAP = {
  'NSE_INDEX|Nifty 50':            'NIFTY',
  'NSE_INDEX|Nifty Bank':          'BANKNIFTY',
  'NSE_INDEX|Nifty Fin Service':   'FINNIFTY',
  'NSE_INDEX|Nifty MidCap Select': 'MIDCPNIFTY',
};

const BSE_INDICES = ['BSE_INDEX|SENSEX', 'BSE_INDEX|BANKEX'];

// Yahoo Finance symbols for option chain fallback
const YAHOO_OC_SYMBOL = {
  'NSE_INDEX|Nifty 50':            'NIFTY',
  'NSE_INDEX|Nifty Bank':          'BANKNIFTY',
  'NSE_INDEX|Nifty Fin Service':   'FINNIFTY',
  'NSE_INDEX|Nifty MidCap Select': 'MIDCPNIFTY',
};

async function getNSEData(sym) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.nseindia.com/',
    'Connection': 'keep-alive',
    'sec-ch-ua': '"Chromium";v="124"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
  };

  // Step 1: Main page cookies
  const home = await fetch('https://www.nseindia.com', {
    headers: { ...headers, Accept: 'text/html,application/xhtml+xml' },
  });
  const setCookie = home.headers.get('set-cookie') || '';
  const cookieStr = setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');

  // Step 2: Option chain page for more cookies
  await fetch('https://www.nseindia.com/option-chain', {
    headers: { ...headers, Cookie: cookieStr, Accept: 'text/html' },
  });

  // Step 3: Fetch data
  const r = await fetch(
    `https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`,
    { headers: { ...headers, Cookie: cookieStr } }
  );
  if (!r.ok) throw new Error(`NSE ${r.status}`);
  return r.json();
}

async function getYahooOptionChain(symbol, expiryDate) {
  try {
    // Yahoo Finance option chain
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${Math.floor(new Date(expiryDate).getTime() / 1000)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    const result = d?.optionChain?.result?.[0];
    if (!result) return null;

    const spot = result.quote?.regularMarketPrice || 0;
    const options = result.options?.[0];
    if (!options) return null;

    // Build strike map
    const strikeMap = {};
    for (const ce of (options.calls || [])) {
      const K = ce.strike;
      if (!strikeMap[K]) strikeMap[K] = { ce: {}, pe: {} };
      strikeMap[K].ce = {
        lastPrice: ce.lastPrice || 0,
        impliedVolatility: (ce.impliedVolatility || 0) * 100,
        openInterest: ce.openInterest || 0,
        pchangeinOpenInterest: ce.percentChange || 0,
        prevClose: ce.ask || 0,
        identifier: `${symbol}${K}CE`,
      };
    }
    for (const pe of (options.puts || [])) {
      const K = pe.strike;
      if (!strikeMap[K]) strikeMap[K] = { ce: {}, pe: {} };
      strikeMap[K].pe = {
        lastPrice: pe.lastPrice || 0,
        impliedVolatility: (pe.impliedVolatility || 0) * 100,
        openInterest: pe.openInterest || 0,
        pchangeinOpenInterest: pe.percentChange || 0,
        prevClose: pe.ask || 0,
        identifier: `${symbol}${K}PE`,
      };
    }

    // Convert to NSE-like format
    const data = Object.entries(strikeMap).map(([K, v]) => ({
      strikePrice: parseFloat(K),
      CE: v.ce,
      PE: v.pe,
    }));

    return {
      source: 'yahoo',
      nse_raw: {
        records: {
          underlyingValue: spot,
          expiryDates: result.expiryDates?.map(ts => new Date(ts * 1000).toISOString().split('T')[0]) || [],
          data,
        },
        filtered: { underlyingValue: spot, data },
      }
    };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key, expiry_date } = req.query;

  if (!instrument_key || !expiry_date)
    return res.status(400).json({ error: 'Missing params' });

  // BSE indices — not available on NSE
  if (BSE_INDICES.includes(instrument_key)) {
    return res.json({
      source: 'unavailable', data: [],
      message: 'BSE option chain not available via NSE API. Connect Upstox for live BSE data.',
    });
  }

  // ── 1. Try Upstox ─────────────────────────────────────────────────────
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instrument_key)}&expiry_date=${expiry_date}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        if (d.data?.length) return res.json({ source: 'upstox', data: d.data });
      }
    } catch {}
  }

  // ── 2. Try NSE ────────────────────────────────────────────────────────
  const sym = NSE_SYMBOL_MAP[instrument_key];
  if (sym) {
    try {
      const d = await getNSEData(sym);
      return res.json({ source: 'nse', nse_raw: d });
    } catch (e) {
      console.error('NSE failed:', e.message);
      // Fall through to Yahoo
    }
  }

  // ── 3. Yahoo Finance fallback ─────────────────────────────────────────
  const yahooSym = YAHOO_OC_SYMBOL[instrument_key];
  if (yahooSym) {
    try {
      const result = await getYahooOptionChain(
        yahooSym === 'NIFTY' ? '^NSEI' :
        yahooSym === 'BANKNIFTY' ? '^NSEBANK' : `${yahooSym}.NS`,
        expiry_date
      );
      if (result) return res.json(result);
    } catch {}
  }

  return res.status(502).json({ error: 'All data sources failed. NSE may be blocking server requests. Please connect your Upstox token in Settings for reliable data.' });
}
