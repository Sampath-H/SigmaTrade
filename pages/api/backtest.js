// pages/api/backtest.js
async function fetchYF(symbol, period, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${period}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const d = await r.json();
  const result = d?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  const q = result.indicators?.quote?.[0] || {};
  const ts = result.timestamp || [];
  return ts.map((t,i) => ({
    date: new Date(t*1000).toISOString().split('T')[0],
    open:  q.open?.[i]||0, high: q.high?.[i]||0,
    low:   q.low?.[i]||0,  close: q.close?.[i]||0,
    volume: q.volume?.[i]||0,
  })).filter(row => row.close > 0);
}

function calcEMA(data, period) {
  const k = 2/(period+1); let ema = data[0];
  return data.map(v => { ema = v*k + ema*(1-k); return ema; });
}
function calcSMA(data, period) {
  return data.map((_,i) => i<period-1?null:data.slice(i-period+1,i+1).reduce((s,v)=>s+v,0)/period);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { symbol='RELIANCE.NS', timeframe='1d', fast=9, slow=21, maType='EMA',
          period='6mo', tp=2, sl=1 } = req.body;

  try {
    const candles = await fetchYF(symbol, period, timeframe);
    if (candles.length < slow+5) return res.status(400).json({ error: 'Not enough data' });

    const closes = candles.map(c => c.close);
    const calc   = maType==='EMA' ? calcEMA : calcSMA;
    const fastMA = calc(closes, parseInt(fast));
    const slowMA = calc(closes, parseInt(slow));

    const trades = [];
    let inPos = false, side='', entry=0, entryDate='', target=0, stop=0;

    for (let i=parseInt(slow)+1; i<candles.length; i++) {
      const fNow=fastMA[i], fPrev=fastMA[i-1], sNow=slowMA[i], sPrev=slowMA[i-1];
      const { close, high, low, date } = candles[i];

      if (!inPos) {
        if (fNow>sNow && fPrev<=sPrev) {
          inPos=true; side='BUY'; entry=close; entryDate=date;
          target=entry*(1+tp/100); stop=entry*(1-sl/100);
        } else if (fNow<sNow && fPrev>=sPrev) {
          inPos=true; side='SELL'; entry=close; entryDate=date;
          target=entry*(1-tp/100); stop=entry*(1+sl/100);
        }
      } else {
        let exitPrice=0, reason='';
        if (side==='BUY') {
          if (high>=target) { exitPrice=target; reason='Target Hit'; }
          else if (low<=stop) { exitPrice=stop; reason='Stop Loss'; }
        } else {
          if (low<=target) { exitPrice=target; reason='Target Hit'; }
          else if (high>=stop) { exitPrice=stop; reason='Stop Loss'; }
        }
        if (!exitPrice && i===candles.length-1) { exitPrice=close; reason='EOD Exit'; }
        if (exitPrice) {
          const pnl = side==='BUY' ? exitPrice-entry : entry-exitPrice;
          trades.push({ side, entry_date:entryDate, exit_date:date,
            entry:Math.round(entry*100)/100, exit:Math.round(exitPrice*100)/100,
            reason, pnl:Math.round(pnl*100)/100 });
          inPos=false;
        }
      }
    }

    const winners = trades.filter(t=>t.pnl>0).length;
    const losers  = trades.filter(t=>t.pnl<=0).length;
    const total   = trades.reduce((s,t)=>s+t.pnl,0);
    const winSum  = trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0);
    const lossSum = Math.abs(trades.filter(t=>t.pnl<=0).reduce((s,t)=>s+t.pnl,0));

    return res.json({
      total_trades: trades.length,
      winners, losers,
      win_rate: trades.length ? Math.round(winners/trades.length*10000)/100 : 0,
      total_pnl: Math.round(total*100)/100,
      avg_trade: trades.length ? Math.round(total/trades.length*100)/100 : 0,
      profit_factor: lossSum>0 ? Math.round(winSum/lossSum*100)/100 : '∞',
      max_drawdown: 0,
      trades: trades.slice(-50),
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
