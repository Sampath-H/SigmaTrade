import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Link from 'next/link';

const INDICES = [
  { key: 'NIFTY',      label: 'Nifty 50',     instrument: 'NSE_INDEX|Nifty 50',           nse: 'NIFTY 50'    },
  { key: 'BANKNIFTY',  label: 'Bank Nifty',    instrument: 'NSE_INDEX|Nifty Bank',          nse: 'NIFTY BANK'  },
  { key: 'FINNIFTY',   label: 'Fin Nifty',     instrument: 'NSE_INDEX|Nifty Fin Service',   nse: 'NIFTY FIN SERVICE' },
  { key: 'MIDCPNIFTY', label: 'Midcap Nifty',  instrument: 'NSE_INDEX|Nifty MidCap Select', nse: 'NIFTY MIDCAP SELECT' },
  { key: 'SENSEX',     label: 'Sensex',         instrument: 'BSE_INDEX|SENSEX',              nse: 'SENSEX'      },
  { key: 'BANKEX',     label: 'BSE Bankex',     instrument: 'BSE_INDEX|BANKEX',              nse: 'BANKEX'      },
];

function IndexCard({ item, data }) {
  const ltp    = data?.ltp  || 0;
  const chg    = data?.chg  || 0;
  const pct    = data?.pct  || 0;
  const high   = data?.high || 0;
  const low    = data?.low  || 0;
  const isUp   = chg >= 0;

  return (
    <Link href={`/option-chain?index=${item.key}`} style={{textDecoration:'none'}}>
      <div className="card" style={{cursor:'pointer',transition:'border .15s',
        borderColor: ltp ? 'var(--border)' : 'var(--border)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',
              letterSpacing:'.08em',marginBottom:3}}>{item.key}</div>
            <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{item.label}</div>
          </div>
          <span style={{fontSize:18,opacity:.6}}>{isUp ? '📈' : '📉'}</span>
        </div>

        <div style={{fontSize:26,fontWeight:900,color:'#fff',letterSpacing:'-.02em',marginBottom:4}}>
          {ltp ? `₹${ltp.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}
        </div>

        <div style={{fontSize:12,fontWeight:600,color:isUp?'var(--green)':'var(--red)',marginBottom:12}}>
          {chg ? `${isUp?'+':''}${chg.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)` : '—'}
        </div>

        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text3)'}}>
          <span>H: {high ? `₹${high.toLocaleString('en-IN')}` : '—'}</span>
          <span>L: {low  ? `₹${low.toLocaleString('en-IN')}` : '—'}</span>
        </div>

        <div style={{marginTop:10,padding:'4px 8px',background:'rgba(59,130,246,.1)',
          border:'1px solid rgba(59,130,246,.2)',borderRadius:5,fontSize:10,
          color:'#60a5fa',textAlign:'center',fontWeight:600}}>
          View Option Chain →
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [prices, setPrices] = useState({});
  const [lastUpdate, setLastUpdate] = useState('');
  const [loading, setLoading] = useState(true);

  async function fetchAllPrices() {
    try {
      const r = await fetch('/api/all-indices');
      const d = await r.json();
      if (d.data) {
        setPrices(d.data);
        setLastUpdate(new Date().toLocaleTimeString('en-IN'));
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchAllPrices();
    const t = setInterval(fetchAllPrices, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <Layout title="Dashboard" subtitle="Live market overview">
      {/* Summary bar */}
      <div className="card" style={{marginBottom:16,display:'flex',gap:24,alignItems:'center',flexWrap:'wrap'}}>
        <div>
          <div className="stat-lbl">Last updated</div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginTop:2}}>
            {lastUpdate || '—'}
          </div>
        </div>
        <div>
          <div className="stat-lbl">Data source</div>
          <div style={{marginTop:2}}>
            <span className="badge badge-nse">🔵 NSE India Live</span>
          </div>
        </div>
        <div style={{marginLeft:'auto'}}>
          <button className="btn btn-ghost" onClick={fetchAllPrices} style={{fontSize:11}}>
            {loading ? <span className="loader" /> : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* Index cards */}
      <div className="grid-3" style={{marginBottom:20}}>
        {INDICES.map(item => (
          <IndexCard key={item.key} item={item} data={prices[item.key]} />
        ))}
      </div>

      {/* Quick actions */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:12}}>Quick Actions</div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <Link href="/option-chain"><button className="btn btn-primary">📊 Open Option Chain</button></Link>
          <Link href="/scanner"><button className="btn btn-ghost">🔍 Run Scanner</button></Link>
          <Link href="/backtest"><button className="btn btn-ghost">📈 Backtest Strategy</button></Link>
          <Link href="/settings"><button className="btn btn-ghost">🔑 Connect Upstox</button></Link>
        </div>
      </div>

      {/* Market status */}
      <div className="card">
        <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:12}}>Market Status</div>
        <div className="grid-4">
          {[
            ['NSE Equity',   'Open 9:15 AM – 3:30 PM', true ],
            ['NSE F&O',      'Open 9:15 AM – 3:30 PM', true ],
            ['BSE Equity',   'Open 9:15 AM – 3:30 PM', true ],
            ['Currency',     'Open 9:00 AM – 5:00 PM', true ],
          ].map(([name, hrs, open]) => (
            <div key={name} style={{background:'var(--bg3)',borderRadius:8,padding:'10px 12px',
              border:`1px solid ${open?'rgba(74,222,128,.2)':'rgba(248,113,113,.2)'}`}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text)',marginBottom:4}}>{name}</div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{width:6,height:6,borderRadius:'50%',
                  background:open?'var(--green)':'var(--red)',display:'inline-block'}} />
                <span style={{fontSize:10,color:open?'var(--green)':'var(--red)',fontWeight:600}}>
                  {open?'OPEN':'CLOSED'}
                </span>
              </div>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>{hrs}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
