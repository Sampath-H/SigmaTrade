import { useState } from 'react';
import Layout from '../components/Layout';

export default function Backtest() {
  const [symbol,    setSymbol]    = useState('RELIANCE.NS');
  const [strategy,  setStrategy]  = useState('MA Crossover');
  const [timeframe, setTimeframe] = useState('1d');
  const [fast,      setFast]      = useState(9);
  const [slow,      setSlow]      = useState(21);
  const [maType,    setMaType]    = useState('EMA');
  const [period,    setPeriod]    = useState('6mo');
  const [tp,        setTp]        = useState(2);
  const [sl,        setSl]        = useState(1);
  const [running,   setRunning]   = useState(false);
  const [result,    setResult]    = useState(null);

  async function runBacktest() {
    setRunning(true); setResult(null);
    try {
      const r = await fetch('/api/backtest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy, timeframe, fast, slow, maType, period, tp, sl }),
      });
      setResult(await r.json());
    } catch(e) { setResult({ error: e.message }); }
    setRunning(false);
  }

  const metrics = result && !result.error ? [
    ['Total Trades',   result.total_trades,  '#c8d8f0'],
    ['Win Rate',       `${result.win_rate}%`,result.win_rate>=50?'var(--green)':'var(--red)'],
    ['Winners',        result.winners,       'var(--green)'],
    ['Losers',         result.losers,        'var(--red)'],
    ['Total P&L',      `${result.total_pnl>=0?'+₹':'₹'}${Math.abs(result.total_pnl).toFixed(2)}`, result.total_pnl>=0?'var(--green)':'var(--red)'],
    ['Avg Trade',      `${result.avg_trade>=0?'+₹':'₹'}${Math.abs(result.avg_trade||0).toFixed(2)}`, result.avg_trade>=0?'var(--green)':'var(--red)'],
    ['Max Drawdown',   `₹${(result.max_drawdown||0).toFixed(2)}`, 'var(--red)'],
    ['Profit Factor',  result.profit_factor||'—', '#c4b5fd'],
  ] : [];

  return (
    <Layout title="Backtest" subtitle="Test your strategy on historical data">
      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:16,alignItems:'start'}}>

        {/* Config */}
        <div className="card">
          <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:14}}>⚙️ Strategy Setup</div>
          {[
            ['Symbol',   <input className="inp" value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="e.g. RELIANCE.NS"/>],
            ['Strategy', <select className="sel" value={strategy} onChange={e=>setStrategy(e.target.value)}>
              <option>MA Crossover</option></select>],
            ['Timeframe',<select className="sel" value={timeframe} onChange={e=>setTimeframe(e.target.value)}>
              {['1d','1wk','1mo'].map(t=><option key={t}>{t}</option>)}</select>],
            ['Period',   <select className="sel" value={period} onChange={e=>setPeriod(e.target.value)}>
              {['1mo','3mo','6mo','1y','2y'].map(p=><option key={p}>{p}</option>)}</select>],
            ['MA Type',  <select className="sel" value={maType} onChange={e=>setMaType(e.target.value)}>
              <option>EMA</option><option>SMA</option></select>],
            ['Fast MA',  <input className="inp" type="number" value={fast} min={2} onChange={e=>setFast(parseInt(e.target.value))}/>],
            ['Slow MA',  <input className="inp" type="number" value={slow} min={5} onChange={e=>setSlow(parseInt(e.target.value))}/>],
            ['Target %', <input className="inp" type="number" value={tp} min={0.1} step={0.1} onChange={e=>setTp(parseFloat(e.target.value))}/>],
            ['Stop Loss %',<input className="inp" type="number" value={sl} min={0.1} step={0.1} onChange={e=>setSl(parseFloat(e.target.value))}/>],
          ].map(([l,inp])=>(
            <div key={l} style={{marginBottom:10}}>
              <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:3}}>{l}</div>
              {inp}
            </div>
          ))}
          <button className="btn btn-primary" style={{width:'100%',justifyContent:'center',marginTop:8}}
            onClick={runBacktest} disabled={running}>
            {running?<><span className="loader" style={{width:14,height:14}}/> Running...</>:'▶ Run Backtest'}
          </button>
        </div>

        {/* Results */}
        <div>
          {result?.error && (
            <div className="card" style={{color:'var(--red)',padding:20}}>❌ {result.error}</div>
          )}

          {result && !result.error && (
            <>
              {/* Summary metrics */}
              <div className="grid-4" style={{marginBottom:16}}>
                {metrics.map(([l,v,c])=>(
                  <div key={l} className="card card-sm" style={{textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{l}</div>
                    <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Trade log */}
              {result.trades?.length>0 && (
                <div style={{overflowX:'auto'}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Trade Log ({result.trades.length} trades)</div>
                  <table className="tbl">
                    <thead>
                      <tr>
                        {['Side','Entry Date','Exit Date','Entry','Exit','Reason','P&L'].map(h=>(
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t,i)=>(
                        <tr key={i}>
                          <td><span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,
                            background:t.side==='BUY'?'rgba(74,222,128,.15)':'rgba(248,113,113,.15)',
                            color:t.side==='BUY'?'var(--green)':'var(--red)'}}>{t.side}</span></td>
                          <td style={{color:'var(--text2)',fontSize:11}}>{t.entry_date}</td>
                          <td style={{color:'var(--text2)',fontSize:11}}>{t.exit_date}</td>
                          <td>₹{(t.entry||0).toFixed(2)}</td>
                          <td>₹{(t.exit||0).toFixed(2)}</td>
                          <td style={{fontSize:11,color:'var(--text3)'}}>{t.reason}</td>
                          <td style={{fontWeight:700,color:t.pnl>=0?'var(--green)':'var(--red)'}}>
                            {t.pnl>=0?'+₹':'₹'}{Math.abs(t.pnl).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!running && !result && (
            <div className="card" style={{textAlign:'center',padding:40,color:'var(--text3)'}}>
              <div style={{fontSize:32,marginBottom:12}}>📈</div>
              <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Ready to backtest</div>
              <div style={{fontSize:12}}>Configure strategy and click Run Backtest</div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
