import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

export default function Settings() {
  const [token, setToken]   = useState('');
  const [saved,  setSaved]  = useState(false);
  const [testing,setTesting]= useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setToken(localStorage.getItem('upstox_token') || '');
  }, []);

  function saveToken() {
    if (token) { localStorage.setItem('upstox_token', token); setSaved(true); setTimeout(()=>setSaved(false),2000); }
    else { localStorage.removeItem('upstox_token'); }
  }

  async function testToken() {
    setTesting(true); setStatus('');
    try {
      const r = await fetch('/api/spot?instrument_key=NSE_INDEX%7CNifty+50',
        { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.ltp) setStatus(`✅ Connected! Nifty 50 LTP: ₹${d.ltp.toLocaleString('en-IN')}`);
      else setStatus('⚠️ Token may be invalid or market is closed');
    } catch { setStatus('❌ Connection failed'); }
    setTesting(false);
  }

  return (
    <Layout title="Settings" subtitle="Configure your trading account">
      <div style={{maxWidth:600}}>

        {/* Token */}
        <div className="card" style={{marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:4}}>🔑 Upstox Access Token</div>
          <div style={{fontSize:12,color:'var(--text3)',marginBottom:16,lineHeight:1.6}}>
            Get your access token from <strong>upstox.com/developer</strong> after completing OAuth login.
            The token is stored locally in your browser — never sent to any server except Upstox.
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',display:'block',marginBottom:4}}>
              Access Token
            </label>
            <input className="inp" type="password" value={token}
              onChange={e=>setToken(e.target.value)}
              placeholder="Paste your Upstox access token here..." />
          </div>
          <div style={{display:'flex',gap:10}}>
            <button className="btn btn-primary" onClick={saveToken}>{saved ? '✅ Saved!' : '💾 Save Token'}</button>
            <button className="btn btn-ghost" onClick={testToken} disabled={!token||testing}>
              {testing ? <span className="loader" style={{width:12,height:12}} /> : '🔍 Test Connection'}
            </button>
            {token && <button className="btn btn-ghost" style={{color:'var(--red)'}}
              onClick={()=>{localStorage.removeItem('upstox_token');setToken('');}}>
              🗑️ Clear
            </button>}
          </div>
          {status && <div style={{marginTop:12,fontSize:12,padding:'8px 12px',borderRadius:6,
            background:'rgba(255,255,255,.04)',border:'1px solid var(--border)'}}>{status}</div>}
        </div>

        {/* How to get token */}
        <div className="card" style={{marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:12}}>📖 How to get Upstox Token</div>
          {[
            ['1', 'Go to upstox.com/developer and create an app'],
            ['2', 'Set Redirect URL to https://sigmatrade.vercel.app/settings'],
            ['3', 'Get your API Key and API Secret'],
            ['4', 'Complete OAuth login to get Access Token'],
            ['5', 'Paste the token above and click Save'],
          ].map(([n,t])=>(
            <div key={n} style={{display:'flex',gap:12,marginBottom:10,alignItems:'flex-start'}}>
              <span style={{background:'var(--blue)',color:'#fff',borderRadius:'50%',width:22,height:22,
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,flexShrink:0}}>{n}</span>
              <span style={{fontSize:12,color:'var(--text2)',lineHeight:1.6}}>{t}</span>
            </div>
          ))}
        </div>

        {/* Data sources */}
        <div className="card">
          <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:12}}>📡 Data Sources</div>
          <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.8}}>
            <div>🟢 <strong>Upstox API</strong> — Real-time data when token is connected</div>
            <div>🔵 <strong>NSE India</strong> — Live data (same as Zerodha) when no token</div>
            <div>🟡 <strong>Simulated</strong> — Black-Scholes demo when NSE unavailable</div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
