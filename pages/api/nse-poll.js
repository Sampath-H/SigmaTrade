// pages/api/nse-poll.js — Fixed cookie handling
const NSE_SUPPORTED = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
const LOT_SIZE = { NIFTY: 75, BANKNIFTY: 30, FINNIFTY: 65, MIDCPNIFTY: 120 };
function cookieHeaderFromResponse(resp){const getSetCookie=resp?.headers?.getSetCookie;if(typeof getSetCookie==='function'){const arr=getSetCookie();if(Array.isArray(arr)&&arr.length)return arr.map(c=>c.split(';')[0].trim()).filter(Boolean).join('; ');}const raw=resp?.headers?.get('set-cookie')||'';if(!raw)return'';return raw.split(/,(?=[^;,]+=[^;,]+)/).map(c=>c.split(';')[0].trim()).filter(Boolean).join('; ');}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { symbol = 'NIFTY' } = req.query;

  if (!NSE_SUPPORTED.includes(symbol)) {
    return res.json({ spot: 0, rows: [], message: `${symbol} not available on NSE` });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nseindia.com/option-chain',
  };

  try {
    const home = await fetch('https://www.nseindia.com', {
      headers: { ...headers, Accept: 'text/html' }
    });
    const cookies = cookieHeaderFromResponse(home);

    const r = await fetch(
      `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`,
      { headers: { ...headers, Cookie: cookies } }
    );
    if (!r.ok) throw new Error(`NSE ${r.status}`);

    const d = await r.json();
    const lot = LOT_SIZE[symbol] || 1;
    const rec = d.records || {}, fil = d.filtered || {};
    const spot = parseFloat(rec.underlyingValue || fil.underlyingValue || 0);

    const rows = (fil.data || rec.data || []).map(row => ({
      strike:   parseInt(row.strikePrice),
      c_key:    row.CE?.identifier || '',
      p_key:    row.PE?.identifier || '',
      c_ltp:    parseFloat(row.CE?.lastPrice || 0),
      p_ltp:    parseFloat(row.PE?.lastPrice || 0),
      c_oi:     (parseFloat(row.CE?.openInterest || 0) * lot),
      p_oi:     (parseFloat(row.PE?.openInterest || 0) * lot),
      c_iv:     parseFloat(row.CE?.impliedVolatility || 0),
      p_iv:     parseFloat(row.PE?.impliedVolatility || 0),
      c_oichg:  parseFloat(row.CE?.pchangeinOpenInterest || 0),
      p_oichg:  parseFloat(row.PE?.pchangeinOpenInterest || 0),
      c_prev:   parseFloat(row.CE?.prevClose || 0),
      p_prev:   parseFloat(row.PE?.prevClose || 0),
      c_delta:  parseFloat(row.CE?.delta || 0),
      p_delta:  parseFloat(row.PE?.delta || 0),
      c_theta:  parseFloat(row.CE?.theta || 0),
      p_theta:  parseFloat(row.PE?.theta || 0),
    }));

    return res.json({ spot, rows });
  } catch (e) {
    return res.status(502).json({ error: e.message, spot: 0, rows: [] });
  }
}
