import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import { decodeFeedResponse, extractTickUpdate } from './proto-decode';

const INDEX_CONFIG = {
  NIFTY:      { instrument_key: 'NSE_INDEX|Nifty 50',           label: 'Nifty 50',     lot: 75,  gap: 50  },
  BANKNIFTY:  { instrument_key: 'NSE_INDEX|Nifty Bank',          label: 'Bank Nifty',   lot: 30,  gap: 100 },
  FINNIFTY:   { instrument_key: 'NSE_INDEX|Nifty Fin Service',   label: 'Fin Nifty',    lot: 65,  gap: 50  },
  MIDCPNIFTY: { instrument_key: 'NSE_INDEX|Nifty MidCap Select', label: 'Midcap Nifty', lot: 120, gap: 25  },
  SENSEX:     { instrument_key: 'BSE_INDEX|SENSEX',              label: 'Sensex',       lot: 20,  gap: 100 },
};

const fmtOI  = v => { v=parseFloat(v)||0; return v>=1e7?(v/1e7).toFixed(2)+' Cr':v>=1e5?(v/1e5).toFixed(2)+' L':v.toLocaleString('en-IN'); };
const fmtNum = (v,d=2) => (parseFloat(v)||0).toFixed(d);
const chgPct = (ltp,prev) => prev ? (ltp-prev)/prev*100 : 0;

function parseNSE(nseData, lot) {
  if (!nseData) return { rows:[], spot:0, expiries:[] };
  const rec=nseData.records||{}, fil=nseData.filtered||{};
  const spot = parseFloat(rec.underlyingValue||fil.underlyingValue||0);
  const expiries = (rec.expiryDates||[]).map(d=>{ try{return new Date(d).toISOString().split('T')[0];}catch{return d;} });
  const byStrike={};
  (fil.data||rec.data||[]).forEach(r=>{
    const K=parseFloat(r.strikePrice);
    if(!byStrike[K]) byStrike[K]={ce:r.CE||{},pe:r.PE||{}};
  });
  const rows = Object.keys(byStrike).sort((a,b)=>a-b).map(K=>{
    const {ce,pe}=byStrike[K];
    return {
      strike:parseInt(K),
      c_key:ce.identifier||`NSE_FO|NIFTY${K}CE`,
      p_key:pe.identifier||`NSE_FO|NIFTY${K}PE`,
      c_ltp:parseFloat(ce.lastPrice)||0,     p_ltp:parseFloat(pe.lastPrice)||0,
      c_iv:parseFloat(ce.impliedVolatility)||0, p_iv:parseFloat(pe.impliedVolatility)||0,
      c_oi:(parseFloat(ce.openInterest)||0)*lot, p_oi:(parseFloat(pe.openInterest)||0)*lot,
      c_oichg:parseFloat(ce.pchangeinOpenInterest)||0, p_oichg:parseFloat(pe.pchangeinOpenInterest)||0,
      c_prev:parseFloat(ce.prevClose)||0,    p_prev:parseFloat(pe.prevClose)||0,
      c_delta:parseFloat(ce.delta)||0,       p_delta:parseFloat(pe.delta)||0,
      c_theta:parseFloat(ce.theta)||0,       p_theta:parseFloat(pe.theta)||0,
    };
  });
  return { rows, spot, expiries };
}

export default function OptionChain() {
  const router  = useRouter();

  const [ready,    setReady]    = useState(false); // token loaded flag
  const [indexKey, setIndexKey] = useState('NIFTY');
  const [expiry,   setExpiry]   = useState('');
  const [expiries, setExpiries] = useState([]);
  const [rows,     setRows]     = useState([]);
  const [spot,     setSpot]     = useState(0);
  const [prevSpot, setPrevSpot] = useState(0);
  const [atm,      setAtm]      = useState(0);
  const [cache,    setCache]    = useState({});
  const [flash,    setFlash]    = useState({});
  const [source,   setSource]   = useState('demo');
  const [wsStatus, setWsStatus] = useState('Connecting...');
  const [wsLive,   setWsLive]   = useState(false);
  const [ticks,    setTicks]    = useState(0);
  const [showGk,   setShowGk]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('chain');
  const [positions,setPositions]= useState([]);
  const [orders,   setOrders]   = useState([]);
  const [orderForm,setOrderForm]= useState({type:'CE',side:'BUY',strike:0,lots:1,price:0,product:'MIS'});
  const [orderMsg, setOrderMsg] = useState('');

  const wsRef    = useRef(null);
  const pollRef  = useRef(null);
  const atmRef   = useRef(null);
  const tokenRef = useRef('');

  const cfg = INDEX_CONFIG[indexKey] || INDEX_CONFIG.NIFTY;

  // ── Step 1: Load token FIRST, then set ready=true ─────────────────────
  useEffect(() => {
    tokenRef.current = localStorage.getItem('upstox_token') || '';
    // Read index from URL
    const idx = router.query.index;
    if (idx && INDEX_CONFIG[idx]) setIndexKey(idx);
    setReady(true);
  }, []);

  // ── Step 2: When ready + indexKey changes, fetch expiries ─────────────
  useEffect(() => {
    if (!ready) return;
    setRows([]); setExpiry(''); setExpiries([]); setCache({});
    wsRef.current?.close();
    clearInterval(pollRef.current);
    fetchExpiries();
  }, [ready, indexKey]);

  // ── Step 3: When expiry is set, fetch chain ───────────────────────────
  useEffect(() => {
    if (!ready || !expiry) return;
    fetchChain();
  }, [ready, expiry]);

  // ── Step 4: When rows load, start live data ───────────────────────────
  useEffect(() => {
    if (!rows.length) return;
    wsRef.current?.close();
    clearInterval(pollRef.current);
    startData();
    return () => { wsRef.current?.close(); clearInterval(pollRef.current); };
  }, [rows.length, indexKey]);

  useEffect(() => {
    setTimeout(() => atmRef.current?.scrollIntoView({ block:'center', behavior:'instant' }), 100);
  }, [rows]);

  // ── Handle URL index param change ─────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const idx = router.query.index;
    if (idx && INDEX_CONFIG[idx] && idx !== indexKey) setIndexKey(idx);
  }, [router.query.index, ready]);

  async function fetchExpiries() {
    const token = tokenRef.current;
    try {
      const r = await fetch(
        `/api/expiry?instrument_key=${encodeURIComponent(cfg.instrument_key)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const d = await r.json();
      if (d.expiries?.length) {
        setExpiries(d.expiries);
        setExpiry(d.expiries[0]); // Always pick first (today's expiry if market day)
      }
    } catch {}
  }

  async function fetchChain() {
    if (!expiry) return;
    setLoading(true);
    const token = tokenRef.current;
    try {
      // Fetch spot price
      const sr = await fetch(
        `/api/spot?instrument_key=${encodeURIComponent(cfg.instrument_key)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const sd = await sr.json();
      const newSpot = sd.ltp || 0;
      if (newSpot) { setSpot(newSpot); setPrevSpot(newSpot); }

      // Fetch option chain
      const cr = await fetch(
        `/api/chain?instrument_key=${encodeURIComponent(cfg.instrument_key)}&expiry_date=${expiry}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const cd = await cr.json();
      setSource(cd.source || 'demo');

      let parsed = [];

      if (cd.source === 'upstox' && cd.data?.length) {
        parsed = cd.data.map(item => {
          const c=item.call_options||{}, p=item.put_options||{};
          const cmd=c.market_data||{}, pmd=p.market_data||{};
          const cgk=c.option_greeks||{}, pgk=p.option_greeks||{};
          const iv = v => { v=parseFloat(v)||0; return v<1 ? Math.round(v*10000)/100 : v; };
          return {
            strike:    parseInt(item.strike_price),
            c_key:     c.instrument_key||'',    p_key:     p.instrument_key||'',
            c_ltp:     parseFloat(cmd.ltp)||0,  p_ltp:     parseFloat(pmd.ltp)||0,
            c_iv:      iv(cgk.iv),              p_iv:      iv(pgk.iv),
            c_oi:      parseFloat(cmd.oi)||0,   p_oi:      parseFloat(pmd.oi)||0,
            c_oichg:   parseFloat(cmd.prev_oi) ? ((parseFloat(cmd.oi)-parseFloat(cmd.prev_oi))/parseFloat(cmd.prev_oi)*100) : 0,
            p_oichg:   parseFloat(pmd.prev_oi) ? ((parseFloat(pmd.oi)-parseFloat(pmd.prev_oi))/parseFloat(pmd.prev_oi)*100) : 0,
            c_prev:    parseFloat(cmd.close_price)||0, p_prev: parseFloat(pmd.close_price)||0,
            c_delta:   parseFloat(cgk.delta)||0,       p_delta: parseFloat(pgk.delta)||0,
            c_theta:   parseFloat(cgk.theta)||0,       p_theta: parseFloat(pgk.theta)||0,
          };
        });
      } else if (cd.source === 'nse' && cd.nse_raw) {
        const p = parseNSE(cd.nse_raw, cfg.lot);
        parsed = p.rows;
        if (p.spot && !newSpot) setSpot(p.spot);
        if (p.expiries.length && !expiries.length) {
          setExpiries(p.expiries);
          if (!expiry) setExpiry(p.expiries[0]);
        }
      } else if (cd.source === 'unavailable') {
        setSource('bse_unavailable');
      }

      parsed.sort((a,b) => a.strike - b.strike);
      const sp = newSpot || spot;
      const atmK = Math.round(sp / cfg.gap) * cfg.gap;
      setAtm(atmK);
      const ai = parsed.reduce((bi,r,i) =>
        Math.abs(r.strike-atmK) < Math.abs(parsed[bi].strike-atmK) ? i : bi, 0);
      // Show 15 strikes around ATM (wider than before)
      setRows(parsed.slice(Math.max(0,ai-12), ai+13));
      setOrderForm(f => ({...f, strike: atmK}));
    } catch(e) { console.error('fetchChain error:', e); }
    setLoading(false);
  }

  function startData() {
    const token = tokenRef.current;
    if (token && token !== 'MOCK_TOKEN') connectWS(token);
    else startPoll();
  }

  function connectWS(token) {
    fetch('/api/wsauth', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (!d.url) { startPoll(); return; }
        const ws = new WebSocket(d.url);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;
        ws.onopen = () => {
          setWsLive(true); setWsStatus('LIVE — Upstox WS');
          const keys = rows.flatMap(r => [r.c_key, r.p_key]).filter(Boolean);
          ws.send(JSON.stringify({ guid:'oc', method:'sub', data:{ mode:'option_greeks', instrumentKeys:keys } }));
        };
        ws.onmessage = e => {
          try {
            let feeds = {};

            if (typeof e.data === 'string') {
              // JSON fallback (rare)
              const msg = JSON.parse(e.data);
              Object.entries(msg.feeds || {}).forEach(([k, f]) => {
                const m = f?.ff?.marketFF || f?.ff?.indexFF || {};
                const lp = m?.ltpc || {}, gk = m?.optionGreeks || {};
                const ltp = parseFloat(lp.ltp || 0);
                if (ltp > 0) feeds[k] = {
                  ltp, oi: parseFloat(m.oi || 0),
                  iv: parseFloat(gk.iv || 0) * 100,
                  delta: parseFloat(gk.delta || 0),
                  theta: parseFloat(gk.theta || 0),
                };
              });
            } else {
              // Binary protobuf — decode using MarketDataFeed.proto structure
              const buffer = e.data instanceof ArrayBuffer ? e.data : e.data.buffer;
              const decoded = decodeFeedResponse(new Uint8Array(buffer));
              Object.entries(decoded.feeds || {}).forEach(([k, feed]) => {
                const tick = extractTickUpdate(k, feed);
                if (tick) feeds[k] = tick;
              });
            }

            if (Object.keys(feeds).length) applyUpdates(feeds);
          } catch(err) {
            console.error('WS decode error:', err);
          }
        };
        ws.onclose = () => {
          setWsLive(false);
          setWsStatus('Reconnecting...');
          setTimeout(() => connectWS(token), 5000);
        };
        ws.onerror = () => startPoll();
      })
      .catch(() => startPoll());
  }

  function startPoll() {
    clearInterval(pollRef.current);
    const BSE_ONLY = ['SENSEX','BANKEX'];
    if (BSE_ONLY.includes(indexKey)) {
      setWsStatus('BSE — connect Upstox for live data');
      return;
    }
    setWsStatus('NSE polling (3s)');
    const sym = { NIFTY:'NIFTY', BANKNIFTY:'BANKNIFTY', FINNIFTY:'FINNIFTY', MIDCPNIFTY:'MIDCPNIFTY' }[indexKey] || 'NIFTY';
    const poll = async () => {
      try {
        const r = await fetch(`/api/nse-poll?symbol=${sym}`);
        const d = await r.json();
        if (d.spot) setSpot(d.spot);
        const updates = {};
        (d.rows||[]).forEach(u => {
          if (u.c_ltp>0) updates[u.c_key] = { ltp:u.c_ltp, oi:u.c_oi, iv:u.c_iv, delta:u.c_delta, theta:u.c_theta };
          if (u.p_ltp>0) updates[u.p_key] = { ltp:u.p_ltp, oi:u.p_oi, iv:u.p_iv, delta:u.p_delta, theta:u.p_theta };
        });
        if (Object.keys(updates).length) applyUpdates(updates);
        setSource('nse');
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
  }

  function applyUpdates(updates) {
    setCache(prev => {
      const next = {...prev}, flashes = {};
      Object.entries(updates).forEach(([k,u]) => {
        const old = prev[k]?.ltp;
        next[k] = {...prev[k], ...u};
        if (old !== undefined && u.ltp !== old) flashes[k] = u.ltp > old ? 'up' : 'dn';
      });
      if (Object.keys(flashes).length) { setFlash(flashes); setTimeout(() => setFlash({}), 500); }
      return next;
    });
    setTicks(t => t + Object.keys(updates).length);
    setPositions(prev => prev.map(p => {
      const u = updates[p.key]; if (!u) return p;
      const pnl = p.side==='BUY' ? (u.ltp-p.entry)*p.qty : (p.entry-u.ltp)*p.qty;
      return {...p, ltp:u.ltp, pnl};
    }));
  }

  async function submitOrder() {
    const row = rows.find(r => r.strike === orderForm.strike);
    const key = orderForm.type==='CE' ? row?.c_key : row?.p_key;
    const snapLtp = orderForm.type==='CE'
      ? (cache[row?.c_key]?.ltp || row?.c_ltp || 0)
      : (cache[row?.p_key]?.ltp || row?.p_ltp || 0);
    const execPrice = orderForm.price > 0 ? orderForm.price : snapLtp;
    const qty = orderForm.lots * cfg.lot;
    const token = tokenRef.current;
    try {
      const r = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
        body: JSON.stringify({
          instrument_key: key, transaction_type: orderForm.side,
          quantity: qty, price: execPrice,
          order_type: orderForm.price > 0 ? 'LIMIT' : 'MARKET',
          product: orderForm.product,
        }),
      });
      const d = await r.json();
      const sym = `${indexKey}${orderForm.strike}${orderForm.type}`;
      setOrderMsg(`✅ ${d.status}: ${d.message}`);
      if (d.status !== 'ERROR') {
        const pos = { sym, side:orderForm.side, qty, entry:execPrice, ltp:execPrice, pnl:0, key,
          time:new Date().toLocaleTimeString('en-IN'), status:d.status };
        setPositions(p => [...p, pos]);
        setOrders(o => [...o, {...pos, orderId:d.order_id, placed_at:new Date().toLocaleTimeString('en-IN')}]);
      }
      setTimeout(() => setOrderMsg(''), 4000);
    } catch(e) { setOrderMsg(`❌ ${e.message}`); }
  }

  const maxCOI = Math.max(...rows.map(r => parseFloat(cache[r.c_key]?.oi||r.c_oi)||0), 1);
  const maxPOI = Math.max(...rows.map(r => parseFloat(cache[r.p_key]?.oi||r.p_oi)||0), 1);
  const totalCOI = rows.reduce((s,r) => s+(parseFloat(cache[r.c_key]?.oi||r.c_oi)||0), 0);
  const totalPOI = rows.reduce((s,r) => s+(parseFloat(cache[r.p_key]?.oi||r.p_oi)||0), 0);
  const pcr = totalCOI ? (totalPOI/totalCOI).toFixed(4) : '—';
  const atmRow = rows.find(r => r.strike === atm);
  const atmIV = atmRow ? fmtNum(((cache[atmRow.c_key]?.iv||atmRow.c_iv)+(cache[atmRow.p_key]?.iv||atmRow.p_iv))/2) : '—';
  const spotChg = spot - prevSpot, spotPct = prevSpot ? spotChg/prevSpot*100 : 0;
  const totalPnL = positions.reduce((s,p) => s+p.pnl, 0);

  const srcBadge = ({
    upstox: { bg:'rgba(74,222,128,.1)',  bc:'rgba(74,222,128,.3)',  c:'#4ade80', t:'🟢 Upstox LIVE' },
    nse:    { bg:'rgba(96,165,250,.1)',  bc:'rgba(96,165,250,.3)',  c:'#60a5fa', t:'🔵 NSE India Live' },
    demo:   { bg:'rgba(251,191,36,.1)', bc:'rgba(251,191,36,.3)', c:'#fbbf24', t:'🟡 Simulated' },
  })[source] || {};

  const CHG = (pct, align) => {
    const c = pct>0?'#4ade80':pct<0?'#f87171':'#64748b', s = pct>0?'+':'';
    return <td style={{textAlign:align,color:c,fontWeight:600,padding:'4px 6px',whiteSpace:'nowrap'}}>
      {s}{fmtNum(pct)}%
    </td>;
  };

  const OIB = (oi, max, col, right=false) => {
    const w = Math.round(Math.min(parseFloat(oi)||0, max)/max*64);
    const bar = <span className="oi-bar" style={{width:w, background:col}}/>;
    return <span style={{display:'flex',alignItems:'center',gap:4,justifyContent:right?'flex-end':'flex-start'}}>
      {right&&bar}{fmtOI(oi)}{!right&&bar}
    </span>;
  };

  const S = {
    td: { padding:'4px 6px', whiteSpace:'nowrap', verticalAlign:'middle' },
    th: { background:'#0a1628', padding:'6px 6px', fontSize:10, fontWeight:700,
          textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap',
          borderBottom:'2px solid rgba(255,255,255,.07)' },
  };

  return (
    <Layout title="Option Chain" subtitle="Live tick-by-tick data">
      {/* Header bar */}
      <div className="card" style={{marginBottom:12,display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:2}}>
            {cfg.label}
          </div>
          <div style={{display:'flex',alignItems:'baseline',gap:8}}>
            <span style={{fontSize:24,fontWeight:900,color:'#fff'}}>
              ₹{spot ? spot.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}
            </span>
            <span style={{fontSize:12,fontWeight:600,color:spotChg>=0?'var(--green)':'var(--red)'}}>
              {spotChg>=0?'+':''}{fmtNum(spotChg)} ({spotChg>=0?'+':''}{fmtNum(spotPct)}%)
            </span>
          </div>
        </div>

        {[['ATM IV',atmIV],['PCR',pcr],['LOT',cfg.lot],['P&L',`${totalPnL>=0?'₹+':'₹-'}${Math.abs(totalPnL).toFixed(2)}`]].map(([l,v])=>(
          <div key={l} style={{textAlign:'center'}}>
            <div style={{fontSize:9,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em'}}>{l}</div>
            <div style={{fontSize:13,fontWeight:700,color:l==='P&L'?(totalPnL>=0?'var(--green)':'var(--red)'):'var(--text)',marginTop:2}}>{v}</div>
          </div>
        ))}

        <div style={{display:'flex',gap:8,alignItems:'center',marginLeft:'auto',flexWrap:'wrap'}}>
          <select className="sel" style={{width:130}} value={indexKey}
            onChange={e => { setIndexKey(e.target.value); }}>
            {Object.entries(INDEX_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="sel" style={{width:120}} value={expiry} onChange={e => setExpiry(e.target.value)}>
            {expiries.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <span className="badge" style={{background:srcBadge.bg,borderColor:srcBadge.bc,color:srcBadge.c,border:`1px solid ${srcBadge.bc}`}}>
            <span className="blink" style={{width:6,height:6,borderRadius:'50%',background:srcBadge.c,display:'inline-block'}}/>
            {srcBadge.t}
          </span>
          {ticks>0 && <span style={{fontSize:10,color:'var(--text3)'}}>Ticks: {ticks}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:0,background:'var(--bg2)',borderRadius:'8px 8px 0 0'}}>
        {[['chain','📊 Option Chain'],['order','🛒 Order Entry'],['positions','📈 Positions'],['orders','📋 Order Book']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:'8px 16px',background:'none',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
            color:tab===t?'#fff':'var(--text3)',borderBottom:tab===t?'2px solid var(--blue)':'2px solid transparent'
          }}>{l}</button>
        ))}
        {tab==='chain'&&(
          <button onClick={()=>setShowGk(g=>!g)} style={{
            marginLeft:'auto',padding:'6px 14px',background:'none',border:'none',cursor:'pointer',
            fontSize:11,fontWeight:600,color:showGk?'var(--blue)':'var(--text3)'
          }}>Show Greeks</button>
        )}
      </div>

      {/* Option Chain Tab */}
      {tab==='chain'&&(
        <div style={{overflowX:'auto',background:'var(--bg2)',borderRadius:'0 0 8px 8px',border:'1px solid var(--border)',borderTop:'none'}}>
          {loading && (
            <div style={{padding:30,textAlign:'center',color:'var(--text3)'}}>
              <div className="loader" style={{margin:'0 auto 8px'}}/> Loading...
            </div>
          )}
          {!loading&&rows.length===0&&(
            <div style={{padding:40,textAlign:'center'}}>
              {source==='bse_unavailable' ? (
                <div>
                  <div style={{fontSize:28,marginBottom:12}}>🏦</div>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:8}}>BSE Option Chain</div>
                  <div style={{fontSize:12,color:'var(--text3)',maxWidth:320,margin:'0 auto',lineHeight:1.7}}>
                    BSE indices require Upstox token for live data.<br/>
                    <strong style={{color:'#facc15'}}>Connect your Upstox token in Settings.</strong>
                  </div>
                  <a href="/settings"><button className="btn btn-primary" style={{marginTop:16}}>⚙️ Go to Settings</button></a>
                </div>
              ) : (
                <div style={{color:'var(--text3)'}}>
                  <div style={{fontSize:28,marginBottom:8}}>📊</div>
                  <div style={{fontSize:13}}>No data. Market may be closed or token expired.</div>
                  <a href="/settings" style={{marginRight:8}}><button className="btn btn-primary" style={{marginTop:12}}>🔑 Refresh Token</button></a>
                  <button className="btn btn-ghost" style={{marginTop:12}} onClick={fetchChain}>🔄 Retry</button>
                </div>
              )}
            </div>
          )}
          {!loading&&rows.length>0&&(
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:860}}>
              <thead>
                <tr>
                  <th colSpan={6} style={{...S.th,color:'#4ade80',textAlign:'right'}}>CALLS ◀</th>
                  <th style={{...S.th,color:'#f1f5f9',textAlign:'center',background:'#0d1a2e'}}>STRIKE</th>
                  <th colSpan={6} style={{...S.th,color:'#f87171',textAlign:'left'}}>▶ PUTS</th>
                </tr>
                <tr>
                  {['OI Chg%','OI (L)','IV','LTP','Chg%',''].map((h,i)=>(
                    <th key={i} style={{...S.th,color:'#4ade80',textAlign:i===5?'center':'right'}}>{h}</th>
                  ))}
                  <th style={{...S.th,color:'#f1f5f9',textAlign:'center',background:'#0d1a2e'}}/>
                  {['','Chg%','LTP','IV','OI (L)','OI Chg%'].map((h,i)=>(
                    <th key={i} style={{...S.th,color:'#f87171',textAlign:i===0?'center':'left'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r=>{
                  const isAtm = r.strike === atm;
                  const cLtp = cache[r.c_key]?.ltp ?? r.c_ltp;
                  const pLtp = cache[r.p_key]?.ltp ?? r.p_ltp;
                  const cIV  = cache[r.c_key]?.iv  ?? r.c_iv;
                  const pIV  = cache[r.p_key]?.iv  ?? r.p_iv;
                  const cOI  = cache[r.c_key]?.oi  ?? r.c_oi;
                  const pOI  = cache[r.p_key]?.oi  ?? r.p_oi;
                  const cF = flash[r.c_key], pF = flash[r.p_key];
                  return [
                    <tr key={r.strike} ref={isAtm?atmRef:null}
                      style={{background:isAtm?'rgba(59,130,246,.11)':'transparent',borderBottom:'1px solid rgba(255,255,255,.03)'}}>
                      {CHG(r.c_oichg,'right')}
                      <td style={{...S.td,color:'#e2e8f0',textAlign:'right'}}>{OIB(cOI,maxCOI,'rgba(74,222,128,.45)',true)}</td>
                      <td style={{...S.td,color:'#c4b5fd',textAlign:'right'}}>{fmtNum(cIV)}%</td>
                      <td className={cF?`flash-${cF}`:''} style={{...S.td,color:'#6ee7b7',fontWeight:700,fontSize:14,textAlign:'right'}}>{fmtNum(cLtp)}</td>
                      {CHG(chgPct(cLtp,r.c_prev),'right')}
                      <td style={{...S.td,textAlign:'center',padding:'3px 4px'}}>
                        <button className="btn btn-green" style={{padding:'2px 7px',fontSize:11,marginRight:2}}
                          onClick={()=>{setTab('order');setOrderForm(f=>({...f,type:'CE',strike:r.strike,side:'BUY'}))}}>B</button>
                        <button className="btn btn-red" style={{padding:'2px 7px',fontSize:11}}
                          onClick={()=>{setTab('order');setOrderForm(f=>({...f,type:'CE',strike:r.strike,side:'SELL'}))}}>S</button>
                      </td>
                      <td style={{...S.td,textAlign:'center',background:'rgba(13,26,46,.9)'}}>
                        {isAtm
                          ? <span style={{background:'var(--blue)',color:'#fff',borderRadius:5,padding:'2px 9px',fontWeight:900}}>{r.strike}</span>
                          : <span style={{fontWeight:700}}>{r.strike}</span>}
                      </td>
                      <td style={{...S.td,textAlign:'center',padding:'3px 4px'}}>
                        <button className="btn btn-green" style={{padding:'2px 7px',fontSize:11,marginRight:2}}
                          onClick={()=>{setTab('order');setOrderForm(f=>({...f,type:'PE',strike:r.strike,side:'BUY'}))}}>B</button>
                        <button className="btn btn-red" style={{padding:'2px 7px',fontSize:11}}
                          onClick={()=>{setTab('order');setOrderForm(f=>({...f,type:'PE',strike:r.strike,side:'SELL'}))}}>S</button>
                      </td>
                      {CHG(chgPct(pLtp,r.p_prev),'left')}
                      <td className={pF?`flash-${pF}`:''} style={{...S.td,color:'#fca5a5',fontWeight:700,fontSize:14,textAlign:'left'}}>{fmtNum(pLtp)}</td>
                      <td style={{...S.td,color:'#c4b5fd',textAlign:'left'}}>{fmtNum(pIV)}%</td>
                      <td style={{...S.td,color:'#e2e8f0',textAlign:'left'}}>{OIB(pOI,maxPOI,'rgba(248,113,113,.45)',false)}</td>
                      {CHG(r.p_oichg,'left')}
                    </tr>,
                    showGk&&<tr key={`gk-${r.strike}`} style={{background:'rgba(59,130,246,.04)',fontSize:11,color:'var(--text3)'}}>
                      <td colSpan={5} style={{...S.td,textAlign:'right'}}>
                        Δ {fmtNum(r.c_delta,4)} &nbsp;|&nbsp; θ {fmtNum(r.c_theta,4)} &nbsp;|&nbsp; IV {fmtNum(cIV)}%
                      </td>
                      <td/><td style={{...S.td,textAlign:'center',fontSize:10}}>Greeks</td><td/>
                      <td colSpan={5} style={{...S.td,textAlign:'left'}}>
                        Δ {fmtNum(r.p_delta,4)} &nbsp;|&nbsp; θ {fmtNum(r.p_theta,4)} &nbsp;|&nbsp; IV {fmtNum(pIV)}%
                      </td>
                    </tr>
                  ];
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Order Entry */}
      {tab==='order'&&(
        <div className="card" style={{borderRadius:'0 0 8px 8px'}}>
          <div className="grid-3" style={{marginBottom:12}}>
            {[
              ['Option Type',<select className="sel" value={orderForm.type} onChange={e=>setOrderForm(f=>({...f,type:e.target.value}))}><option value="CE">CE — Call</option><option value="PE">PE — Put</option></select>],
              ['Side',<select className="sel" value={orderForm.side} onChange={e=>setOrderForm(f=>({...f,side:e.target.value}))}><option value="BUY">BUY</option><option value="SELL">SELL</option></select>],
              ['Strike',<select className="sel" value={orderForm.strike} onChange={e=>setOrderForm(f=>({...f,strike:parseInt(e.target.value)}))}>{rows.map(r=><option key={r.strike} value={r.strike}>{r.strike}</option>)}</select>],
              ['Lots',<input className="inp" type="number" min={1} max={500} value={orderForm.lots} onChange={e=>setOrderForm(f=>({...f,lots:parseInt(e.target.value)||1}))}/>],
              ['Price (0=Market)',<input className="inp" type="number" min={0} step={0.05} value={orderForm.price} onChange={e=>setOrderForm(f=>({...f,price:parseFloat(e.target.value)||0}))}/>],
              ['Product',<select className="sel" value={orderForm.product} onChange={e=>setOrderForm(f=>({...f,product:e.target.value}))}><option value="MIS">MIS — Intraday</option><option value="NRML">NRML — Overnight</option></select>],
            ].map(([l,inp],i)=>(
              <div key={i}>
                <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{l}</div>
                {inp}
              </div>
            ))}
          </div>
          <div style={{fontSize:12,color:'var(--text2)',marginBottom:12}}>
            Symbol: <strong>{indexKey}{orderForm.strike}{orderForm.type}</strong> &nbsp;|&nbsp;
            Qty: {orderForm.lots} × {cfg.lot} = <strong>{orderForm.lots*cfg.lot}</strong>
          </div>
          <button onClick={submitOrder} style={{
            width:'100%',padding:12,border:'none',borderRadius:8,fontSize:13,fontWeight:800,cursor:'pointer',
            background:orderForm.side==='BUY'?'#166534':'#7f1d1d',
            color:orderForm.side==='BUY'?'#bbf7d0':'#fecaca',
            border:`1px solid ${orderForm.side==='BUY'?'#16a34a':'#dc2626'}`
          }}>
            {orderForm.side} {orderForm.lots*cfg.lot} × {indexKey}{orderForm.strike}{orderForm.type} @ {orderForm.price||'MARKET'}
          </button>
          {orderMsg&&<div style={{marginTop:10,fontSize:12,color:orderMsg.startsWith('✅')?'var(--green)':'var(--red)'}}>{orderMsg}</div>}
        </div>
      )}

      {/* Positions */}
      {tab==='positions'&&(
        <div className="card" style={{borderRadius:'0 0 8px 8px'}}>
          <div style={{display:'flex',gap:24,paddingBottom:12,borderBottom:'1px solid var(--border)',marginBottom:12}}>
            {[['Total P&L',`${totalPnL>=0?'₹+':'₹-'}${Math.abs(totalPnL).toFixed(2)}`,totalPnL>=0?'var(--green)':'var(--red)'],
              ['Open',positions.length,'var(--text)']].map(([l,v,c])=>(
              <div key={l}>
                <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase'}}>{l}</div>
                <div style={{fontSize:20,fontWeight:800,color:c,marginTop:2}}>{v}</div>
              </div>
            ))}
          </div>
          {positions.length===0
            ?<div style={{padding:24,textAlign:'center',color:'var(--text3)'}}>No open positions.</div>
            :positions.map((p,i)=>(
              <div key={i} className="card card-sm" style={{marginBottom:8,display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontWeight:700,minWidth:140}}>{p.sym}</span>
                {[['Side',p.side,p.side==='BUY'?'var(--green)':'var(--red)'],
                  ['Qty',p.qty,'var(--text)'],['Entry',`₹${p.entry.toFixed(2)}`,'var(--text)'],
                  ['LTP',`₹${(p.ltp||p.entry).toFixed(2)}`,'var(--text)']].map(([l,v,c])=>(
                  <div key={l}>
                    <div style={{fontSize:10,color:'var(--text3)'}}>{l}</div>
                    <div style={{fontSize:12,fontWeight:600,color:c}}>{v}</div>
                  </div>
                ))}
                <div>
                  <div style={{fontSize:10,color:'var(--text3)'}}>P&L</div>
                  <div style={{fontSize:14,fontWeight:800,color:p.pnl>=0?'var(--green)':'var(--red)'}}>
                    {p.pnl>=0?'+₹':'-₹'}{Math.abs(p.pnl).toFixed(2)}
                  </div>
                </div>
                <div style={{marginLeft:'auto',fontSize:10,color:'var(--text3)'}}>{p.time}</div>
                <button className="btn btn-red" style={{padding:'3px 10px',fontSize:11}}
                  onClick={()=>setPositions(ps=>ps.filter((_,j)=>j!==i))}>✕ Close</button>
              </div>
            ))
          }
        </div>
      )}

      {/* Orders */}
      {tab==='orders'&&(
        <div className="card" style={{borderRadius:'0 0 8px 8px'}}>
          {orders.length===0
            ?<div style={{padding:24,textAlign:'center',color:'var(--text3)'}}>No orders placed yet.</div>
            :orders.map((o,i)=>(
              <div key={i} style={{display:'flex',gap:12,alignItems:'center',padding:'8px 0',
                borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
                <span style={{fontWeight:700,color:o.side==='BUY'?'var(--green)':'var(--red)',minWidth:36}}>{o.side}</span>
                <span style={{fontWeight:600}}>{o.sym}</span>
                <span style={{color:'var(--text2)'}}>Qty: {o.qty}</span>
                <span style={{color:'var(--text2)'}}>@ ₹{o.entry.toFixed(2)}</span>
                <span style={{fontSize:10,padding:'2px 8px',borderRadius:4,fontWeight:700,
                  background:'rgba(74,222,128,.15)',color:'var(--green)'}}>{o.status}</span>
                <span style={{color:'var(--text3)',fontSize:11,marginLeft:'auto'}}>{o.placed_at}</span>
              </div>
            ))
          }
        </div>
      )}
    </Layout>
  );
}
