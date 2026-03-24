// pages/api/scanner.js
// All 5 scanner types ported from Python scanner.py

const UNIVERSE = {
  'Nifty 50': [
    'RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS',
    'ITC.NS','SBIN.NS','BHARTIARTL.NS','KOTAKBANK.NS','LT.NS','AXISBANK.NS',
    'ASIANPAINT.NS','MARUTI.NS','TITAN.NS','SUNPHARMA.NS','WIPRO.NS','HCLTECH.NS',
    'ULTRACEMCO.NS','NESTLEIND.NS','BAJFINANCE.NS','TATAMOTORS.NS','POWERGRID.NS',
    'NTPC.NS','ONGC.NS','COALINDIA.NS','BPCL.NS','GRASIM.NS','JSWSTEEL.NS','HINDALCO.NS',
  ],
  'Nifty 100': [
    'RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS',
    'ITC.NS','SBIN.NS','BHARTIARTL.NS','KOTAKBANK.NS','LT.NS','AXISBANK.NS',
    'BAJFINANCE.NS','TATAMOTORS.NS','SUNPHARMA.NS','WIPRO.NS','HCLTECH.NS',
    'ADANIENT.NS','ADANIPORTS.NS','TECHM.NS','TATASTEEL.NS','INDUSINDBK.NS',
    'DIVISLAB.NS','DRREDDY.NS','CIPLA.NS','EICHERMOT.NS','BAJAJ-AUTO.NS','HEROMOTOCO.NS',
  ],
  'Nifty 500': [
    'RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS',
    'ITC.NS','SBIN.NS','BHARTIARTL.NS','KOTAKBANK.NS','LT.NS','AXISBANK.NS',
    'BAJFINANCE.NS','TATAMOTORS.NS','SUNPHARMA.NS','WIPRO.NS','HCLTECH.NS',
    'ADANIENT.NS','ADANIPORTS.NS','TECHM.NS','TATASTEEL.NS','INDUSINDBK.NS',
    'DIVISLAB.NS','DRREDDY.NS','CIPLA.NS','EICHERMOT.NS','BAJAJ-AUTO.NS','HEROMOTOCO.NS',
    'PIDILITIND.NS','DMART.NS','TRENT.NS','HAVELLS.NS','MUTHOOTFIN.NS','GODREJCP.NS',
  ],
  'F&O Stocks': [
    'RELIANCE.NS','TCS.NS','INFY.NS','HDFCBANK.NS','ICICIBANK.NS','SBIN.NS',
    'BHARTIARTL.NS','WIPRO.NS','TATASTEEL.NS','COALINDIA.NS','AXISBANK.NS',
    'BAJFINANCE.NS','HCLTECH.NS','TATAMOTORS.NS','INDUSINDBK.NS','TECHM.NS',
  ],
};

// ── Fibonacci constants ──────────────────────────────────────────────────
const FIB_LEVELS = [
  1,2,3,5,8,13,21,34,55,89,144,233,377,610,987,
  1597,2584,4181,6765,10946,17711,28657,46368,75025,121393
];
const FIB_RATIOS = [0.236, 0.618, 0.786];

// ── Fetch from Yahoo Finance ─────────────────────────────────────────────
async function fetchYF(symbol, range = '1mo', interval = '1d') {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) return null;
    const q = result.indicators?.quote?.[0] || {};
    const ts = result.timestamp || [];
    return ts.map((t, i) => ({
      ts: t,
      open:   q.open?.[i]   ?? null,
      high:   q.high?.[i]   ?? null,
      low:    q.low?.[i]    ?? null,
      close:  q.close?.[i]  ?? null,
      volume: q.volume?.[i] ?? 0,
    })).filter(row => row.close !== null);
  } catch { return null; }
}

// ── Date helpers ─────────────────────────────────────────────────────────
function getLastFriday() {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun … 6=Sat
  const daysAgo = dow >= 5 ? dow - 5 : dow + 2;
  const fri = new Date(today);
  fri.setDate(today.getDate() - daysAgo);
  fri.setHours(0, 0, 0, 0);
  return fri;
}

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

function getWeekdaysSinceFriday(fridayDate) {
  const days = [];
  const today = new Date(); today.setHours(0,0,0,0);
  let cur = new Date(fridayDate);
  cur.setDate(cur.getDate() + 1);
  while (cur <= today) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function fmtPrice(n) {
  if (n === null || n === undefined) return null;
  const f = parseFloat(n);
  if (f === Math.floor(f)) return String(Math.floor(f));
  return parseFloat(f.toFixed(2)).toString();
}

// ── 1. Current Signals (basic) ───────────────────────────────────────────
async function scanCurrentSignals(symbols) {
  const fridayDate = getLastFriday();
  const fridayStr  = toDateStr(fridayDate);
  const results = [];

  for (const symbol of symbols) {
    try {
      const data = await fetchYF(symbol, '15d', '1d');
      if (!data || data.length < 3) continue;

      // find Friday row
      const fridayRow = data.find(row => {
        const d = new Date(row.ts * 1000);
        return toDateStr(d) === fridayStr;
      });
      if (!fridayRow) continue;

      const latest   = data[data.length - 1];
      const prev     = data[data.length - 2];
      const ltp      = latest.close;
      const prevClose= prev.close;
      const chng     = ltp - prevClose;
      const pctChng  = prevClose ? (chng / prevClose) * 100 : 0;
      const friHigh  = fridayRow.high;
      const friLow   = fridayRow.low;

      let sig = 'Neutral';
      if (ltp > friHigh) sig = 'Bullish Confirmed';
      else if (ltp < friLow) sig = 'Bearish Confirmed';

      results.push({
        Stock:          symbol.replace('.NS',''),
        Signal:         sig,
        LTP:            fmtPrice(ltp),
        CHNG:           fmtPrice(chng),
        '%CHNG':        fmtPrice(pctChng),
        Open:           fmtPrice(latest.open),
        High:           fmtPrice(latest.high),
        Low:            fmtPrice(latest.low),
        'Prev. Close':  fmtPrice(prevClose),
        'Friday High':  fmtPrice(friHigh),
        'Friday Low':   fmtPrice(friLow),
      });
    } catch { continue; }
  }
  return results;
}

// ── 2. Current Signals with Cluster Analysis ─────────────────────────────
async function scanClusterAnalysis(symbols) {
  const fridayDate = getLastFriday();
  const fridayStr  = toDateStr(fridayDate);
  const weekdays   = getWeekdaysSinceFriday(fridayDate);
  const results    = [];

  for (const symbol of symbols) {
    try {
      const data = await fetchYF(symbol, '15d', '1d');
      if (!data || data.length < 3) continue;

      const fridayRow = data.find(row => toDateStr(new Date(row.ts * 1000)) === fridayStr);
      if (!fridayRow) continue;

      const latest    = data[data.length - 1];
      const prev      = data[data.length - 2];
      const ltp       = latest.close;
      const prevClose = prev.close;
      const chng      = ltp - prevClose;
      const pctChng   = prevClose ? (chng / prevClose) * 100 : 0;
      const friHigh   = fridayRow.high;
      const friLow    = fridayRow.low;

      // Friday cluster zone (±1% of Friday open, capped by day range)
      const friOpen     = fridayRow.open;
      const onePct      = friOpen * 0.01;
      const halfRange   = (friHigh - friLow) * 0.5;
      const clusterRng  = Math.min(onePct, halfRange);
      const clusterHigh = Math.min(friOpen + clusterRng, friHigh);
      const clusterLow  = Math.max(friOpen - clusterRng, friLow);

      // Check weekday closes
      const weekdayStrs = weekdays.map(toDateStr);
      let hadBreakout = false, hadBreakdown = false;
      for (const row of data) {
        const ds = toDateStr(new Date(row.ts * 1000));
        if (!weekdayStrs.includes(ds)) continue;
        if (row.close > friHigh) hadBreakout  = true;
        if (row.close < friLow)  hadBreakdown = true;
      }
      const inCluster = ltp >= clusterLow && ltp <= clusterHigh;

      let sig;
      if      (hadBreakdown && inCluster) sig = "Breakdown Done but Price Returns Friday's Cluster";
      else if (hadBreakout  && inCluster) sig = "Breakout Done but Price Returns Friday's Cluster";
      else if (ltp > friHigh)             sig = 'Bullish Confirmed';
      else if (ltp < friLow)              sig = 'Bearish Confirmed';
      else if (hadBreakout || hadBreakdown) sig = 'Post-Movement Consolidation';
      else                                sig = 'Neutral';

      results.push({
        Stock:                symbol.replace('.NS',''),
        Signal:               sig,
        LTP:                  fmtPrice(ltp),
        CHNG:                 fmtPrice(chng),
        '%CHNG':              fmtPrice(pctChng),
        Open:                 fmtPrice(latest.open),
        High:                 fmtPrice(latest.high),
        Low:                  fmtPrice(latest.low),
        'Prev. Close':        fmtPrice(prevClose),
        'Friday High':        fmtPrice(friHigh),
        'Friday Low':         fmtPrice(friLow),
        'Friday Cluster High':fmtPrice(clusterHigh),
        'Friday Cluster Low': fmtPrice(clusterLow),
      });
    } catch { continue; }
  }
  return results;
}

// ── 3. Daily Breakout Tracking ───────────────────────────────────────────
async function scanDailyBreakout(symbols) {
  const fridayDate = getLastFriday();
  const fridayStr  = toDateStr(fridayDate);
  const weekdays   = getWeekdaysSinceFriday(fridayDate);
  const weekdayStrs= weekdays.map(toDateStr);
  const results    = [];

  for (const symbol of symbols) {
    try {
      const data = await fetchYF(symbol, '15d', '1d');
      if (!data || data.length < 2) continue;

      const fridayRow = data.find(row => toDateStr(new Date(row.ts * 1000)) === fridayStr);
      if (!fridayRow) continue;

      const friHigh = fridayRow.high;
      const friLow  = fridayRow.low;

      let breakoutDay  = null;
      let breakoutType = null;

      for (const row of data) {
        const ds = toDateStr(new Date(row.ts * 1000));
        if (!weekdayStrs.includes(ds)) continue;
        if (row.high > friHigh && !breakoutDay) {
          breakoutDay  = new Date(row.ts * 1000);
          breakoutType = 'Bullish';
          break;
        }
        if (row.low < friLow && !breakoutDay) {
          breakoutDay  = new Date(row.ts * 1000);
          breakoutType = 'Bearish';
          break;
        }
      }

      const ltp = data[data.length - 1].close;
      let currentSignal = 'Neutral';
      if (ltp > friHigh) currentSignal = 'Bullish Confirmed';
      else if (ltp < friLow) currentSignal = 'Bearish Confirmed';

      results.push({
        Stock:            symbol.replace('.NS',''),
        'Friday High':    fmtPrice(friHigh),
        'Friday Low':     fmtPrice(friLow),
        'Breakout Day':   breakoutDay
          ? breakoutDay.toLocaleDateString('en-IN', { weekday:'long', month:'short', day:'numeric' })
          : 'No Breakout',
        'Breakout Type':  breakoutType || 'None',
        'Current Price':  fmtPrice(ltp),
        'Current Signal': currentSignal,
        'Days Since Friday': weekdays.length,
      });
    } catch { continue; }
  }
  return results;
}

// ── 4. Monthly Marubozu Open Scan ────────────────────────────────────────
async function scanMonthlyMarubozu(symbols) {
  const results = [];

  for (const symbol of symbols) {
    try {
      // Monthly OHLC
      const monthly = await fetchYF(symbol, '4mo', '1mo');
      if (!monthly || monthly.length < 2) continue;

      const prevMonth = monthly[monthly.length - 2];
      const pOpen  = prevMonth.open;
      const pHigh  = prevMonth.high;
      const pLow   = prevMonth.low;
      const pClose = prevMonth.close;

      const bodyBull = pClose - pOpen;
      const bodyBear = pOpen  - pClose;
      const totalRng = pHigh  - pLow;
      if (totalRng <= 0) continue;

      // Green Marubozu
      if (bodyBull > 0) {
        const bodyPct      = (bodyBull / totalRng) * 100;
        const upperWickPct = ((pHigh - pClose) / bodyBull) * 100;
        const lowerWickPct = ((pOpen  - pLow)  / bodyBull) * 100;
        const isBull = bodyPct >= 75 && upperWickPct <= 25 && lowerWickPct <= 25;

        if (isBull) {
          const daily = await fetchYF(symbol, '5d', '1d');
          if (!daily || !daily.length) continue;
          const ltp = daily[daily.length - 1].close;
          const tol = pOpen * 0.02;
          if (ltp >= pOpen - tol && ltp <= pOpen + tol) {
            const rally    = ((ltp - pClose) / (pHigh - pClose)) * 100;
            const distance = ((ltp - pOpen) / pOpen) * 100;
            const prevTs   = new Date(prevMonth.ts * 1000);
            results.push({
              Stock:                    symbol.replace('.NS',''),
              'Prev Month':             prevTs.toLocaleString('en-IN', { month:'short', year:'numeric' }),
              'Setup Type':             'Bullish Retracement',
              'Prev Month Open':        pOpen.toFixed(2),
              'Prev Month High':        pHigh.toFixed(2),
              'Prev Month Low':         pLow.toFixed(2),
              'Prev Month Close':       pClose.toFixed(2),
              'Body %':                 bodyPct.toFixed(1),
              'Current Price':          ltp.toFixed(2),
              'Distance from Prev Open':  `${distance >= 0 ? '+' : ''}${distance.toFixed(1)}%`,
              'Rally %':                rally.toFixed(1),
            });
          }
        }
      }

      // Red Marubozu
      if (bodyBear > 0) {
        const bodyPct      = (bodyBear / totalRng) * 100;
        const upperWickPct = ((pHigh - pOpen)  / bodyBear) * 100;
        const lowerWickPct = ((pClose - pLow)  / bodyBear) * 100;
        const isBear = bodyPct >= 75 && upperWickPct <= 25 && lowerWickPct <= 25;

        if (isBear) {
          const daily = await fetchYF(symbol, '5d', '1d');
          if (!daily || !daily.length) continue;
          const ltp = daily[daily.length - 1].close;
          const tol = pOpen * 0.02;
          if (ltp >= pOpen - tol && ltp <= pOpen + tol) {
            const rally    = ((ltp - pClose) / (pOpen - pClose)) * 100;
            const distance = ((ltp - pOpen) / pOpen) * 100;
            const prevTs   = new Date(prevMonth.ts * 1000);
            results.push({
              Stock:                    symbol.replace('.NS',''),
              'Prev Month':             prevTs.toLocaleString('en-IN', { month:'short', year:'numeric' }),
              'Setup Type':             'Bearish Retracement',
              'Prev Month Open':        pOpen.toFixed(2),
              'Prev Month High':        pHigh.toFixed(2),
              'Prev Month Low':         pLow.toFixed(2),
              'Prev Month Close':       pClose.toFixed(2),
              'Body %':                 bodyPct.toFixed(1),
              'Current Price':          ltp.toFixed(2),
              'Distance from Prev Open': `${distance >= 0 ? '+' : ''}${distance.toFixed(1)}%`,
              'Rally %':                rally.toFixed(1),
            });
          }
        }
      }
    } catch { continue; }
  }
  return results;
}

// ── 5. Fibonacci Level Scan ──────────────────────────────────────────────
function pctDist(price, level) {
  return level ? Math.abs(price - level) / level * 100 : 999;
}

async function scanFibonacci(symbols, tolerancePct = 1.5) {
  const results = [];

  for (const symbol of symbols) {
    try {
      const data = await fetchYF(symbol, '2d', '1d');
      if (!data || data.length < 1) continue;

      const ltp       = data[data.length - 1].close;
      const prevClose = data.length >= 2 ? data[data.length - 2].close : ltp;
      const chngPct   = prevClose ? ((ltp - prevClose) / prevClose) * 100 : 0;

      // Nearest absolute Fib number
      const nearestFib = FIB_LEVELS.reduce((a, b) => Math.abs(b - ltp) < Math.abs(a - ltp) ? b : a);
      const distFib    = pctDist(ltp, nearestFib);
      const nearFib    = distFib <= tolerancePct;

      // Bracketing Fib levels
      const below   = FIB_LEVELS.filter(f => f <= ltp);
      const above   = FIB_LEVELS.filter(f => f > ltp);
      const fibLow  = below.length ? Math.max(...below) : FIB_LEVELS[0];
      const fibHigh = above.length ? Math.min(...above) : FIB_LEVELS[FIB_LEVELS.length - 1];
      const rng     = fibHigh - fibLow;

      // Retracement levels
      const nearRet = {};
      for (const ratio of FIB_RATIOS) {
        const level = +(fibLow + ratio * rng).toFixed(2);
        const d     = pctDist(ltp, level);
        nearRet[ratio] = d <= tolerancePct ? { level, d } : null;
      }

      if (!nearFib && !Object.values(nearRet).some(v => v)) continue;

      const fmtRet = r => {
        const v = nearRet[r];
        return v ? `${v.level.toFixed(2)} (${v.d.toFixed(2)}%)` : '—';
      };

      results.push({
        Stock:        symbol.replace('.NS',''),
        LTP:          ltp.toFixed(2),
        'Change %':   chngPct.toFixed(2),
        'Near Fib #': nearFib ? `${nearestFib} (${distFib.toFixed(2)}%)` : '—',
        'Fib Range':  `${fibLow} → ${fibHigh}`,
        '0.236':      fmtRet(0.236),
        '0.618':      fmtRet(0.618),
        '0.786':      fmtRet(0.786),
        _minDist:     Math.min(distFib, ...Object.values(nearRet).map(v => v ? v.d : 999)),
      });
    } catch { continue; }
  }

  // Sort by closest distance
  results.sort((a, b) => a._minDist - b._minDist);
  results.forEach(r => delete r._minDist);
  return results;
}

// ── Main handler ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    universe     = 'Nifty 50',
    scanType     = 'Current Signals',
    fibTolerance = 1.5,
  } = req.body;

  const symbols = UNIVERSE[universe] || UNIVERSE['Nifty 50'];

  try {
    let results = [];

    if (scanType === 'Current Signals') {
      results = await scanCurrentSignals(symbols);
    } else if (scanType === 'Current Signals with Cluster Analysis') {
      results = await scanClusterAnalysis(symbols);
    } else if (scanType === 'Daily Breakout Tracking') {
      results = await scanDailyBreakout(symbols);
    } else if (scanType === 'Monthly Marubozu Open Scan') {
      results = await scanMonthlyMarubozu(symbols);
    } else if (scanType === 'Fibonacci Level Scan') {
      results = await scanFibonacci(symbols, parseFloat(fibTolerance));
    }

    return res.json({ results, total: symbols.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
