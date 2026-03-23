<<<<<<< HEAD
// pages/api/nse-poll.js — Fixed cookie handling
const NSE_SUPPORTED = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];

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
    // Fresh cookies every call (Vercel is stateless)
    const home = await fetch('https://www.nseindia.com', {
      headers: { ...headers, Accept: 'text/html' }
    });
    const cookies = home.headers.get('set-cookie') || '';

    const r = await fetch(
      `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`,
      { headers: { ...headers, Cookie: cookies } }
    );
    if (!r.ok) throw new Error(`NSE ${r.status}`);

    const d = await r.json();
    const rec = d.records || {}, fil = d.filtered || {};
    const spot = parseFloat(rec.underlyingValue || fil.underlyingValue || 0);
    const expiries = (rec.expiryDates || []).map(e => {
      try { return new Date(e).toISOString().split('T')[0]; } catch { return e; }
    });

    const rows = (fil.data || rec.data || []).map(row => ({
      strike:   parseInt(row.strikePrice),
      c_key:    row.CE?.identifier || '',
      p_key:    row.PE?.identifier || '',
      c_ltp:    parseFloat(row.CE?.lastPrice || 0),
      p_ltp:    parseFloat(row.PE?.lastPrice || 0),
      c_oi:     parseFloat(row.CE?.openInterest || 0),
      p_oi:     parseFloat(row.PE?.openInterest || 0),
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

    return res.json({ spot, rows, expiries });
  } catch (e) {
    return res.status(502).json({ error: e.message, spot: 0, rows: [] });
=======
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { symbol = 'NIFTY' } = req.query;
  try {
    const pf = await fetch('https://www.nseindia.com/option-chain', {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0', Accept: 'text/html' }
    });
    const cookies = pf.headers.get('set-cookie') || '';
    const r = await fetch(`https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0', Accept: 'application/json',
        Referer: 'https://www.nseindia.com/option-chain', Cookie: cookies }
    });
    const d = await r.json();
    const rec = d.records || {}, fil = d.filtered || {};
    const spot = parseFloat(rec.underlyingValue || fil.underlyingValue || 0);
    const rows = (fil.data || rec.data || []).map(row => ({
      strike: parseInt(row.strikePrice),
      c_key: row.CE?.identifier || '', p_key: row.PE?.identifier || '',
      c_ltp: parseFloat(row.CE?.lastPrice || 0), p_ltp: parseFloat(row.PE?.lastPrice || 0),
      c_oi: parseFloat(row.CE?.openInterest || 0), p_oi: parseFloat(row.PE?.openInterest || 0),
      c_iv: parseFloat(row.CE?.impliedVolatility || 0), p_iv: parseFloat(row.PE?.impliedVolatility || 0),
      c_oichg: parseFloat(row.CE?.pchangeinOpenInterest || 0),
      p_oichg: parseFloat(row.PE?.pchangeinOpenInterest || 0),
      c_prev: parseFloat(row.CE?.prevClose || 0), p_prev: parseFloat(row.PE?.prevClose || 0),
      c_delta: parseFloat(row.CE?.delta || 0), p_delta: parseFloat(row.PE?.delta || 0),
      c_theta: parseFloat(row.CE?.theta || 0), p_theta: parseFloat(row.PE?.theta || 0),
    }));
    return res.json({ spot, rows, expiries: rec.expiryDates || [] });
  } catch (e) {
    return res.status(502).json({ error: e.message });
>>>>>>> 7dc49498fac3f7d626dd538895dd11d21fa5fdca
  }
}
