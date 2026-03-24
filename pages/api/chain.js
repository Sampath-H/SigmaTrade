// pages/api/chain.js
// Ported directly from Python algo_trading.py nse_parse_option_chain + api_get_option_chain

const NSE_SYMBOL = {
  'NSE_INDEX|Nifty 50':            'NIFTY',
  'NSE_INDEX|Nifty Bank':          'BANKNIFTY',
  'NSE_INDEX|Nifty Fin Service':   'FINNIFTY',
  'NSE_INDEX|Nifty MidCap Select': 'MIDCPNIFTY',
};

const LOT_SIZE = {
  'NSE_INDEX|Nifty 50':            75,
  'NSE_INDEX|Nifty Bank':          30,
  'NSE_INDEX|Nifty Fin Service':   65,
  'NSE_INDEX|Nifty MidCap Select': 120,
  'BSE_INDEX|SENSEX':              20,
  'BSE_INDEX|BANKEX':              30,
};

function _s(d, k, dv = 0) {
  const v = d?.[k];
  return (v !== null && v !== undefined) ? parseFloat(v) || dv : dv;
}

function fmtDate(d) {
  // Convert "24-Mar-2026" → "2026-03-24"
  try {
    const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                     Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    const [day, mon, year] = d.split('-');
    if (months[mon]) return `${year}-${months[mon]}-${day.padStart(2,'0')}`;
    return new Date(d).toISOString().split('T')[0];
  } catch { return d; }
}

// Parse NSE JSON into same format as Upstox chain data
function nse_parse_option_chain(nse_data, instrument_key) {
  if (!nse_data) return { data: [], spot: 0, expiries: [] };

  const lot    = LOT_SIZE[instrument_key] || 75;
  const records = nse_data.records  || {};
  const filtered= nse_data.filtered || {};

  const spot = parseFloat(records.underlyingValue || filtered.underlyingValue || 0);
  const expiries = (records.expiryDates || []).map(fmtDate);

  const rows = filtered.data || records.data || [];
  const byStrike = {};

  for (const row of rows) {
    const K   = parseFloat(row.strikePrice);
    const exp = fmtDate(row.expiryDate || '');
    const ce  = row.CE || {};
    const pe  = row.PE || {};
    if (!byStrike[K]) byStrike[K] = {};
    if (!byStrike[K][exp]) byStrike[K][exp] = { ce, pe };
  }

  const data = [];
  for (const K of Object.keys(byStrike).map(Number).sort((a,b)=>a-b)) {
    const expData = byStrike[K];
    if (!expData) continue;
    const first = Object.keys(expData)[0];
    const { ce, pe } = expData[first];

    data.push({
      strike_price: K,
      call_options: {
        instrument_key: ce.identifier || `NSE_FO|NIFTY${Math.round(K)}CE`,
        market_data: {
          ltp:         _s(ce, 'lastPrice'),
          oi:          _s(ce, 'openInterest') * lot,
          prev_oi:     _s(ce, 'pchangeinOpenInterest'),
          volume:      _s(ce, 'totalTradedVolume'),
          close_price: _s(ce, 'prevClose'),
          lot_size:    lot,
        },
        option_greeks: {
          iv:    _s(ce, 'impliedVolatility'),
          delta: _s(ce, 'delta'),
          theta: _s(ce, 'theta'),
          gamma: _s(ce, 'gamma'),
          vega:  _s(ce, 'vega'),
        },
      },
      put_options: {
        instrument_key: pe.identifier || `NSE_FO|NIFTY${Math.round(K)}PE`,
        market_data: {
          ltp:         _s(pe, 'lastPrice'),
          oi:          _s(pe, 'openInterest') * lot,
          prev_oi:     _s(pe, 'pchangeinOpenInterest'),
          volume:      _s(pe, 'totalTradedVolume'),
          close_price: _s(pe, 'prevClose'),
          lot_size:    lot,
        },
        option_greeks: {
          iv:    _s(pe, 'impliedVolatility'),
          delta: _s(pe, 'delta'),
          theta: _s(pe, 'theta'),
          gamma: _s(pe, 'gamma'),
          vega:  _s(pe, 'vega'),
        },
      },
    });
  }

  return { data, spot, expiries };
}

// Fetch from NSE with fresh session (like Python _nse_session())
async function nse_fetch_option_chain(sym) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nseindia.com/',
  };

  // Fresh cookies
  const home = await fetch('https://www.nseindia.com', {
    headers: { ...headers, Accept: 'text/html,application/xhtml+xml' }
  });
  const cookieRaw = home.headers.get('set-cookie') || '';
  const cookies = cookieRaw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

  // Hit option chain page for extra cookies
  await fetch('https://www.nseindia.com/option-chain', {
    headers: { ...headers, Cookie: cookies, Accept: 'text/html' }
  });

  const r = await fetch(
    `https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`,
    { headers: { ...headers, Cookie: cookies } }
  );
  if (!r.ok) throw new Error(`NSE ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key, expiry_date } = req.query;

  if (!instrument_key || !expiry_date)
    return res.status(400).json({ error: 'Missing params' });

  // BSE — only via Upstox
  if (instrument_key.startsWith('BSE_INDEX')) {
    if (!token || token === 'MOCK_TOKEN') {
      return res.json({ source: 'unavailable', data: [],
        message: 'BSE option chain requires Upstox token. Go to Settings → Login with Upstox.' });
    }
  }

  // ── 1. Upstox API (exact same as Python api_get_option_chain) ─────────
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instrument_key)}&expiry_date=${expiry_date}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        const data = d.data || [];
        if (data.length > 0) {
          console.log(`Upstox chain: ${data.length} strikes for ${instrument_key} ${expiry_date}`);
          return res.json({ source: 'upstox', data });
        }
      } else {
        console.error('Upstox chain error:', r.status, await r.text());
      }
    } catch (e) {
      console.error('Upstox chain exception:', e.message);
    }
  }

  // ── 2. NSE API (same as Python nse_fetch_option_chain + nse_parse_option_chain) ──
  const sym = NSE_SYMBOL[instrument_key];
  if (sym) {
    try {
      const nse_raw = await nse_fetch_option_chain(sym);
      const parsed = nse_parse_option_chain(nse_raw, instrument_key);
      if (parsed.data.length > 0) {
        console.log(`NSE chain: ${parsed.data.length} strikes`);
        // Return in same Upstox format so frontend parses identically
        return res.json({
          source: 'upstox', // pretend upstox so frontend uses same parser
          data: parsed.data,
          spot: parsed.spot,
          expiries: parsed.expiries,
        });
      }
    } catch (e) {
      console.error('NSE chain error:', e.message);
    }
  }

  return res.status(502).json({
    error: 'Could not load option chain. Please ensure your Upstox token is valid (Settings → Login with Upstox).',
    source: 'none',
    data: [],
  });
}
