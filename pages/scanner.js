import { useState } from 'react';
import Layout from '../components/Layout';

const SCAN_TYPES = [
  'Current Signals',
  'Current Signals with Cluster Analysis',
  'Daily Breakout Tracking',
  'Monthly Marubozu Open Scan',
  'Fibonacci Level Scan',
];

const UNIVERSES = ['Nifty 50', 'Nifty 100', 'Nifty 500', 'F&O Stocks'];

export default function Scanner() {
  const [universe,    setUniverse]    = useState('Nifty 50');
  const [scanType,    setScanType]    = useState('Current Signals');
  const [fibTolerance,setFibTolerance]= useState(1.5);
  const [running,     setRunning]     = useState(false);
  const [results,     setResults]     = useState([]);
  const [signal,      setSignal]      = useState('ALL');
  const [error,       setError]       = useState(null);

  async function runScan() {
    setRunning(true); setResults([]); setError(null); setSignal('ALL');
    try {
      const r = await fetch('/api/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universe, scanType, fibTolerance }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); } else { setResults(d.results || []); }
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  }

  // ── Filter for Current Signals tab ──────────────────────────────────────
  const filtered = signal === 'ALL'
    ? results
    : signal === 'Bullish'
      ? results.filter(r => r.Signal === 'Bullish Confirmed')
      : signal === 'Bearish'
        ? results.filter(r => r.Signal === 'Bearish Confirmed')
        : signal === 'Cluster'
          ? results.filter(r => r.Signal && r.Signal.includes('Returns'))
          : results;

  const isCurrentSignals = scanType === 'Current Signals' || scanType === 'Current Signals with Cluster Analysis';
  const isDailyBreakout  = scanType === 'Daily Breakout Tracking';
  const isMarubozu       = scanType === 'Monthly Marubozu Open Scan';
  const isFib            = scanType === 'Fibonacci Level Scan';

  function signalColor(sig) {
    if (!sig) return {};
    if (sig === 'Bullish Confirmed')    return { background:'rgba(74,222,128,.15)', color:'#4ade80' };
    if (sig === 'Bearish Confirmed')    return { background:'rgba(248,113,113,.15)', color:'#f87171' };
    if (sig.includes('Returns'))        return { background:'rgba(250,204,21,.15)', color:'#facc15' };
    if (sig === 'Post-Movement Consolidation') return { background:'rgba(96,165,250,.15)', color:'#60a5fa' };
    return { background:'rgba(156,163,175,.15)', color:'#9ca3af' };
  }

  return (
    <Layout title="Scanner" subtitle="Scan stocks for trading signals">
      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:16, alignItems:'start' }}>

        {/* ── Config Panel ───────────────────────────────────────────── */}
        <div className="card">
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14 }}>
            ⚙️ Configure Scanner
          </div>

          {/* Universe */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>Universe</div>
            <select className="sel" value={universe} onChange={e => setUniverse(e.target.value)}>
              {UNIVERSES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>

          {/* Scanner Type — styled like the Python sidebar radio */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>
              Scanner Type
            </div>
            {SCAN_TYPES.map(t => (
              <div
                key={t}
                onClick={() => { setScanType(t); setResults([]); setError(null); }}
                style={{
                  padding:'9px 12px',
                  borderRadius:8,
                  marginBottom:4,
                  cursor:'pointer',
                  fontSize:12,
                  fontWeight: scanType === t ? 700 : 400,
                  background: scanType === t ? 'var(--blue)' : 'transparent',
                  color: scanType === t ? '#fff' : 'var(--text2)',
                  transition:'background .15s',
                  userSelect:'none',
                }}
              >
                {t}
              </div>
            ))}
          </div>

          {/* Fib tolerance — only for Fibonacci scan */}
          {isFib && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>
                Tolerance % (±)
              </div>
              <input
                className="inp"
                type="number"
                step={0.1}
                min={0.5}
                max={5}
                value={fibTolerance}
                onChange={e => setFibTolerance(parseFloat(e.target.value))}
              />
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:4 }}>
                Max % distance from a Fibonacci number to qualify
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width:'100%', justifyContent:'center', marginTop:4 }}
            onClick={runScan}
            disabled={running}
          >
            {running
              ? <><span className="loader" style={{ width:14, height:14 }} /> Scanning...</>
              : '🔍 Run Scan'}
          </button>

          {running && (
            <div style={{ marginTop:12 }}>
              <div style={{ height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                <div className="pulse" style={{ height:'100%', background:'var(--blue)', borderRadius:2, width:'60%' }} />
              </div>
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:4, textAlign:'center' }}>
                Scanning {universe}…
              </div>
            </div>
          )}
        </div>

        {/* ── Results Panel ──────────────────────────────────────────── */}
        <div>
          {error && (
            <div className="card" style={{ color:'var(--red)', fontSize:13, marginBottom:12 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Empty state */}
          {!running && results.length === 0 && !error && (
            <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text3)' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Ready to scan</div>
              <div style={{ fontSize:12 }}>Select a scanner type and click Run Scan</div>
            </div>
          )}

          {/* ── Current Signals / Cluster Results ──────────────────── */}
          {isCurrentSignals && results.length > 0 && (
            <>
              {/* Summary pills */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
                  {filtered.length} signals found
                </span>
                <div style={{ marginLeft:'auto', display:'flex', gap:6, flexWrap:'wrap' }}>
                  {['ALL','Bullish','Bearish','Cluster','Neutral'].map(s => (
                    <button key={s} onClick={() => setSignal(s)} style={{
                      padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)',
                      background: signal === s ? 'var(--blue)' : 'transparent',
                      color: signal === s ? '#fff' : 'var(--text2)',
                      cursor:'pointer', fontSize:11, fontWeight:600,
                    }}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      {['Stock','Signal','LTP','%Chng','Open','High','Low','Fri High','Fri Low',
                        ...(scanType === 'Current Signals with Cluster Analysis' ? ['Cluster High','Cluster Low'] : [])
                      ].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight:700, color:'var(--text)' }}>{r.Stock}</td>
                        <td>
                          <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700, ...signalColor(r.Signal) }}>
                            {r.Signal}
                          </span>
                        </td>
                        <td style={{ fontWeight:600 }}>₹{r.LTP}</td>
                        <td style={{ color: parseFloat(r['%CHNG']) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
                          {parseFloat(r['%CHNG']) >= 0 ? '+' : ''}{r['%CHNG']}%
                        </td>
                        <td style={{ color:'var(--text2)' }}>{r.Open}</td>
                        <td style={{ color:'var(--text2)' }}>{r.High}</td>
                        <td style={{ color:'var(--text2)' }}>{r.Low}</td>
                        <td style={{ color:'var(--green)' }}>{r['Friday High']}</td>
                        <td style={{ color:'var(--red)' }}>{r['Friday Low']}</td>
                        {scanType === 'Current Signals with Cluster Analysis' && <>
                          <td style={{ color:'var(--text2)' }}>{r['Friday Cluster High'] || '—'}</td>
                          <td style={{ color:'var(--text2)' }}>{r['Friday Cluster Low'] || '—'}</td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Daily Breakout Tracking ────────────────────────────── */}
          {isDailyBreakout && results.length > 0 && (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:12 }}>
                📅 Daily Breakout Tracking — {results.length} stocks
              </div>
              <div style={{ overflowX:'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      {['Stock','Fri High','Fri Low','Breakout Day','Breakout Type','Current Price','Current Signal','Days Since Fri'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight:700 }}>{r.Stock}</td>
                        <td style={{ color:'var(--green)' }}>₹{r['Friday High']}</td>
                        <td style={{ color:'var(--red)' }}>₹{r['Friday Low']}</td>
                        <td style={{ color:'var(--text2)', fontSize:11 }}>{r['Breakout Day']}</td>
                        <td>
                          {r['Breakout Type'] !== 'None' && (
                            <span style={{
                              padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700,
                              ...signalColor(r['Breakout Type'] === 'Bullish' ? 'Bullish Confirmed' : 'Bearish Confirmed')
                            }}>
                              {r['Breakout Type']}
                            </span>
                          )}
                          {r['Breakout Type'] === 'None' && <span style={{ color:'var(--text3)' }}>—</span>}
                        </td>
                        <td style={{ fontWeight:600 }}>₹{r['Current Price']}</td>
                        <td>
                          <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700, ...signalColor(r['Current Signal']) }}>
                            {r['Current Signal']}
                          </span>
                        </td>
                        <td style={{ color:'var(--text2)', textAlign:'center' }}>{r['Days Since Friday']}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Monthly Marubozu ────────────────────────────────────── */}
          {isMarubozu && results.length > 0 && (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:12 }}>
                📊 Monthly Marubozu Open Scan — {results.length} matches
              </div>
              <div style={{ overflowX:'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      {['Stock','Prev Month','Setup Type','Prev Open','Prev High','Prev Low','Prev Close','Body %','Current Price','Distance from Prev Open','Rally %'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight:700 }}>{r.Stock}</td>
                        <td style={{ color:'var(--text2)', fontSize:11 }}>{r['Prev Month']}</td>
                        <td>
                          <span style={{
                            padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700,
                            background: r['Setup Type'] === 'Bullish Retracement' ? 'rgba(74,222,128,.15)' : 'rgba(248,113,113,.15)',
                            color: r['Setup Type'] === 'Bullish Retracement' ? 'var(--green)' : 'var(--red)',
                          }}>
                            {r['Setup Type']}
                          </span>
                        </td>
                        <td>₹{r['Prev Month Open']}</td>
                        <td style={{ color:'var(--green)' }}>₹{r['Prev Month High']}</td>
                        <td style={{ color:'var(--red)' }}>₹{r['Prev Month Low']}</td>
                        <td>₹{r['Prev Month Close']}</td>
                        <td style={{ color:'var(--text2)' }}>{r['Body %']}%</td>
                        <td style={{ fontWeight:600 }}>₹{r['Current Price']}</td>
                        <td style={{ color: r['Distance from Prev Open']?.startsWith('+') ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
                          {r['Distance from Prev Open']}
                        </td>
                        <td style={{ color:'var(--text2)' }}>{r['Rally %']}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Fibonacci Level Scan ────────────────────────────────── */}
          {isFib && results.length > 0 && (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:8 }}>
                🌀 Fibonacci Level Scan — {results.length} matches
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:12, lineHeight:1.6 }}>
                <b>Fib Range</b> — Two consecutive Fibonacci numbers bracketing the price (low → high) &nbsp;|&nbsp;
                <b>Near Fib #</b> — Price is close to an absolute Fibonacci number &nbsp;|&nbsp;
                <b>0.236 / 0.618 / 0.786</b> — Retracement levels between the bracket fibs
              </div>
              <div style={{ overflowX:'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      {['Stock','LTP','Change %','Near Fib #','Fib Range','0.236','0.618','0.786'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight:700 }}>{r.Stock}</td>
                        <td style={{ fontWeight:600 }}>₹{r.LTP}</td>
                        <td style={{ color: parseFloat(r['Change %']) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
                          {parseFloat(r['Change %']) >= 0 ? '+' : ''}{r['Change %']}%
                        </td>
                        <td style={{ color:'var(--yellow, #facc15)', fontWeight:600 }}>{r['Near Fib #']}</td>
                        <td style={{ color:'var(--text2)', fontSize:11 }}>{r['Fib Range']}</td>
                        <td style={{ color:'var(--text2)', fontSize:11 }}>{r['0.236']}</td>
                        <td style={{ color:'var(--text2)', fontSize:11 }}>{r['0.618']}</td>
                        <td style={{ color:'var(--text2)', fontSize:11 }}>{r['0.786']}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* No results message after scan */}
          {!running && results.length === 0 && !error && scanType && (
            <></>
          )}
        </div>
      </div>
    </Layout>
  );
}
