import { useState } from 'react';
import Layout from '../components/Layout';

const SCAN_TYPES = ['MA Crossover', 'RSI Oversold/Overbought', 'Bollinger Band Breakout', 'MACD Signal', 'Volume Surge'];
const UNIVERSES  = ['Nifty 50', 'Nifty 100', 'Nifty 500', 'F&O Stocks'];

export default function Scanner() {
  const [universe,  setUniverse]  = useState('Nifty 50');
  const [scanType,  setScanType]  = useState('MA Crossover');
  const [timeframe, setTimeframe] = useState('1d');
  const [fast,      setFast]      = useState(9);
  const [slow,      setSlow]      = useState(21);
  const [maType,    setMaType]    = useState('EMA');
  const [running,   setRunning]   = useState(false);
  const [results,   setResults]   = useState([]);
  const [progress,  setProgress]  = useState(0);
  const [signal,    setSignal]    = useState('ALL');

  async function runScan() {
    setRunning(true); setResults([]); setProgress(0);
    try {
      const r = await fetch('/api/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universe, scanType, timeframe, fast, slow, maType }),
      });
      const d = await r.json();
      setResults(d.results || []);
    } catch(e) {
      console.error(e);
    }
    setProgress(100); setRunning(false);
  }

  const filtered = signal === 'ALL' ? results : results.filter(r => r.signal === signal);

  return (
    <Layout title="Scanner" subtitle="Scan stocks for trading signals">
      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:16,alignItems:'start'}}>

        {/* Config panel */}
        <div className="card">
          <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:14}}>⚙️ Scan Settings</div>

          {[
            ['Universe', <select className="sel" value={universe} onChange={e=>setUniverse(e.target.value)}>
              {UNIVERSES.map(u=><option key={u}>{u}</option>)}</select>],
            ['Scan Type', <select className="sel" value={scanType} onChange={e=>setScanType(e.target.value)}>
              {SCAN_TYPES.map(s=><option key={s}>{s}</option>)}</select>],
            ['Timeframe', <select className="sel" value={timeframe} onChange={e=>setTimeframe(e.target.value)}>
              {['1m','5m','15m','1h','1d','1wk'].map(t=><option key={t}>{t}</option>)}</select>],
            ['MA Type', <select className="sel" value={maType} onChange={e=>setMaType(e.target.value)}>
              <option>EMA</option><option>SMA</option></select>],
            ['Fast Period', <input className="inp" type="number" value={fast} min={2} onChange={e=>setFast(parseInt(e.target.value))}/>],
            ['Slow Period', <input className="inp" type="number" value={slow} min={5} onChange={e=>setSlow(parseInt(e.target.value))}/>],
          ].map(([l,inp])=>(
            <div key={l} style={{marginBottom:12}}>
              <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{l}</div>
              {inp}
            </div>
          ))}

          <button className="btn btn-primary" style={{width:'100%',justifyContent:'center',marginTop:4}}
            onClick={runScan} disabled={running}>
            {running ? <><span className="loader" style={{width:14,height:14}}/> Scanning...</> : '🔍 Run Scan'}
          </button>

          {running && (
            <div style={{marginTop:12}}>
              <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
                <div className="pulse" style={{height:'100%',background:'var(--blue)',borderRadius:2,width:'60%'}}/>
              </div>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:4,textAlign:'center'}}>Scanning {universe}...</div>
            </div>
          )}
        </div>

        {/* Results */}
        <div>
          {results.length > 0 && (
            <>
              <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{filtered.length} signals found</span>
                <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                  {['ALL','BUY','SELL'].map(s=>(
                    <button key={s} onClick={()=>setSignal(s)} style={{
                      padding:'4px 12px',borderRadius:6,border:'1px solid var(--border)',
                      background:signal===s?'var(--blue)':'transparent',
                      color:signal===s?'#fff':'var(--text2)',cursor:'pointer',fontSize:11,fontWeight:600
                    }}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="tbl">
                  <thead>
                    <tr>
                      {['Symbol','Signal','LTP','Change%','Fast MA','Slow MA','Volume','Action'].map(h=>(
                        <th key={h} style={{textAlign:h==='Action'?'center':'left'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r,i)=>(
                      <tr key={i}>
                        <td style={{fontWeight:700,color:'var(--text)'}}>{r.symbol}</td>
                        <td>
                          <span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,
                            background:r.signal==='BUY'?'rgba(74,222,128,.15)':'rgba(248,113,113,.15)',
                            color:r.signal==='BUY'?'var(--green)':'var(--red)'}}>
                            {r.signal}
                          </span>
                        </td>
                        <td style={{fontWeight:600}}>₹{(r.ltp||0).toFixed(2)}</td>
                        <td style={{color:r.change>=0?'var(--green)':'var(--red)',fontWeight:600}}>
                          {r.change>=0?'+':''}{(r.change||0).toFixed(2)}%
                        </td>
                        <td style={{color:'var(--text2)'}}>{(r.fast_ma||0).toFixed(2)}</td>
                        <td style={{color:'var(--text2)'}}>{(r.slow_ma||0).toFixed(2)}</td>
                        <td style={{color:'var(--text2)'}}>{(r.volume||0).toLocaleString('en-IN')}</td>
                        <td style={{textAlign:'center'}}>
                          <button className="btn" style={{
                            padding:'2px 10px',fontSize:11,
                            background:r.signal==='BUY'?'#166534':'#7f1d1d',
                            color:r.signal==='BUY'?'#bbf7d0':'#fecaca',
                            border:`1px solid ${r.signal==='BUY'?'#16a34a':'#dc2626'}`
                          }}>
                            {r.signal==='BUY'?'BUY':'SELL'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!running && results.length === 0 && (
            <div className="card" style={{textAlign:'center',padding:40,color:'var(--text3)'}}>
              <div style={{fontSize:32,marginBottom:12}}>🔍</div>
              <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Ready to scan</div>
              <div style={{fontSize:12}}>Configure your settings and click Run Scan</div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
