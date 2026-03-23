// pages/api/scanner.js
// Server-side stock scanning using Yahoo Finance data
const UNIVERSE = {
  'Nifty 50': ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS',
    'ITC.NS','SBIN.NS','BHARTIARTL.NS','KOTAKBANK.NS','LT.NS','AXISBANK.NS','ASIANPAINT.NS',
    'MARUTI.NS','TITAN.NS','SUNPHARMA.NS','WIPRO.NS','HCLTECH.NS','ULTRACEMCO.NS','NESTLEIND.NS'],
  'Nifty 100': ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS',
    'ITC.NS','SBIN.NS','BHARTIARTL.NS','KOTAKBANK.NS','LT.NS','AXISBANK.NS','BAJFINANCE.NS','TATAMOTORS.NS'],
  'F&O Stocks': ['NIFTY','BANKNIFTY','RELIANCE.NS','TCS.NS','INFY.NS','HDFCBANK.NS','ICICIBANK.NS',
    'SBIN.NS','BHARTIARTL.NS','WIPRO.NS','TATASTEEL.NS','COALINDIA.NS'],
};

async function fetchYF(symbol, period='6mo', interval='1d') {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${period}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) return null;
    const closes  = result.indicators?.quote?.[0]?.close  || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    const timestamps = result.timestamp || [];
    return closes.map((c,i) => ({ close: c, volume: volumes[i]||0, ts: timestamps[i] }))
      .filter(row => row.close !== null && row.close !== undefined);
  } catch { return null; }
}

function calcEMA(data, period) {
  const k = 2/(period+1);
  let ema = data[0];
  return data.map(v => { ema = v*k + ema*(1-k); return ema; });
}

function calcSMA(data, period) {
  return data.map((_,i) => i<period-1 ? null : data.slice(i-period+1,i+1).reduce((s,v)=>s+v,0)/period);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { universe='Nifty 50', scanType='MA Crossover', timeframe='1d', fast=9, slow=21, maType='EMA' } = req.body;

  const symbols = UNIVERSE[universe] || UNIVERSE['Nifty 50'];
  const results = [];

  for (const symbol of symbols.slice(0,20)) { // limit to 20 for speed
    try {
      const data = await fetchYF(symbol, '6mo', timeframe==='1d'?'1d':timeframe==='1wk'?'1wk':'1d');
      if (!data || data.length < slow+5) continue;

      const closes  = data.map(d => d.close);
      const volumes = data.map(d => d.volume);
      const calc    = maType==='EMA' ? calcEMA : calcSMA;
      const fastMA  = calc(closes, parseInt(fast));
      const slowMA  = calc(closes, parseInt(slow));

      const n  = closes.length - 1;
      const ltp     = closes[n];
      const prevClose = closes[n-1]||ltp;
      const change  = ((ltp-prevClose)/prevClose)*100;
      const fNow = fastMA[n], fPrev = fastMA[n-1];
      const sNow = slowMA[n], sPrev = slowMA[n-1];

      let signal = null;
      if (fNow > sNow && fPrev <= sPrev) signal = 'BUY';
      if (fNow < sNow && fPrev >= sPrev) signal = 'SELL';

      if (signal) {
        results.push({
          symbol: symbol.replace('.NS',''),
          signal, ltp: Math.round(ltp*100)/100,
          change: Math.round(change*100)/100,
          fast_ma: Math.round(fNow*100)/100,
          slow_ma: Math.round(sNow*100)/100,
          volume: volumes[n]||0,
        });
      }
    } catch { continue; }
  }

  return res.json({ results, total: symbols.length, scanned: Math.min(symbols.length,20) });
}
