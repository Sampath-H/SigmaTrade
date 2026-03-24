import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';

export default function Settings() {
  const router = useRouter();

  const [apiKey,    setApiKey]    = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [token,     setToken]     = useState('');
  const [saved,     setSaved]     = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [status,    setStatus]    = useState('');
  const [exchanging,setExchanging]= useState(false);

  const REDIRECT_URI = typeof window !== 'undefined'
    ? `${window.location.origin}/settings`
    : 'https://sigmatrade.vercel.app/settings';

  // Load saved credentials on mount
  useEffect(() => {
    setApiKey(localStorage.getItem('upstox_api_key')    || '');
    setApiSecret(localStorage.getItem('upstox_api_secret') || '');
    setToken(localStorage.getItem('upstox_token')       || '');
  }, []);

  // Handle OAuth callback — Upstox redirects back with ?code=xxx
  useEffect(() => {
    const code = router.query.code;
    if (!code) return;

    const key    = localStorage.getItem('upstox_api_key')    || '';
    const secret = localStorage.getItem('upstox_api_secret') || '';
    if (!key || !secret) {
      setStatus('❌ API Key / Secret not found. Please save them first then retry OAuth.');
      return;
    }

    setExchanging(true);
    setStatus('⏳ Exchanging code for access token...');

    fetch('/api/oauth-callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, apiKey: key, apiSecret: secret, redirectUri: REDIRECT_URI }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.access_token) {
          localStorage.setItem('upstox_token', d.access_token);
          setToken(d.access_token);
          setStatus('✅ OAuth successful! Token saved. You can now use live data.');
          // Clean up URL
          router.replace('/settings', undefined, { shallow: true });
        } else {
          setStatus(`❌ Token exchange failed: ${d.error || 'Unknown error'}`);
        }
      })
      .catch(e => setStatus(`❌ Error: ${e.message}`))
      .finally(() => setExchanging(false));
  }, [router.query.code]);

  function saveCredentials() {
    localStorage.setItem('upstox_api_key',    apiKey);
    localStorage.setItem('upstox_api_secret', apiSecret);
    if (token) localStorage.setItem('upstox_token', token);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function startOAuth() {
    if (!apiKey) { setStatus('❌ Please enter your API Key first'); return; }
    localStorage.setItem('upstox_api_key',    apiKey);
    localStorage.setItem('upstox_api_secret', apiSecret);
    const url = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${apiKey}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = url;
  }

  async function testToken() {
    setTesting(true); setStatus('');
    try {
      const r = await fetch('/api/spot?instrument_key=NSE_INDEX%7CNifty+50',
        { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.ltp) setStatus(`✅ Connected! Nifty 50 LTP: ₹${d.ltp.toLocaleString('en-IN')} (Source: ${d.source})`);
      else setStatus('⚠️ Token may be expired or invalid. Please do OAuth Login again.');
    } catch { setStatus('❌ Connection failed'); }
    setTesting(false);
  }

  function clearAll() {
    localStorage.removeItem('upstox_token');
    localStorage.removeItem('upstox_api_key');
    localStorage.removeItem('upstox_api_secret');
    setToken(''); setApiKey(''); setApiSecret('');
    setStatus('🗑️ All credentials cleared.');
  }

  const hasToken = !!token;

  return (
    <Layout title="Settings" subtitle="Configure your trading account">
      <div style={{ maxWidth: 620 }}>

        {/* OAuth Status Banner */}
        {exchanging && (
          <div className="card" style={{ marginBottom: 16, background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="loader" style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>Completing OAuth login...</span>
            </div>
          </div>
        )}

        {/* Token Status */}
        <div className="card" style={{ marginBottom: 16, background: hasToken ? 'rgba(74,222,128,.06)' : 'rgba(248,113,113,.06)', border: `1px solid ${hasToken ? 'rgba(74,222,128,.2)' : 'rgba(248,113,113,.2)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{hasToken ? '🟢' : '🔴'}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {hasToken ? 'Upstox Connected' : 'Upstox Not Connected'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                {hasToken
                  ? 'Live tick-by-tick data active. Token expires at midnight — login again tomorrow.'
                  : 'Connect Upstox to get live option chain, dashboard data, and place orders.'}
              </div>
            </div>
          </div>
        </div>

        {/* API Credentials */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>🔑 API Credentials</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
            Enter your Upstox API Key and Secret from <strong>upstox.com/developer</strong>.
            These are saved locally in your browser.
          </div>

          {[
            ['API Key',    apiKey,    setApiKey,    'text',     'Enter your Upstox API Key'],
            ['API Secret', apiSecret, setApiSecret, 'password', 'Enter your Upstox API Secret'],
          ].map(([label, val, setter, type, ph]) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>
                {label}
              </label>
              <input className="inp" type={type} value={val}
                onChange={e => setter(e.target.value)} placeholder={ph} />
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={saveCredentials}>
              {saved ? '✅ Saved!' : '💾 Save Credentials'}
            </button>
          </div>
        </div>

        {/* OAuth Login */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            🚀 One-Click OAuth Login
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
            Click below to open Upstox login. After you authorize, you'll be redirected back here automatically and the token will be saved.
            <br />
            ⚠️ <strong>Do this every day</strong> — Upstox tokens expire at midnight IST.
          </div>

          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: 'var(--text3)' }}>
            <strong style={{ color: 'var(--text2)' }}>Redirect URI</strong> (set this in Upstox developer portal):
            <div style={{ fontFamily: 'monospace', color: 'var(--blue)', marginTop: 4, wordBreak: 'break-all' }}>
              {REDIRECT_URI}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', fontSize: 13, padding: '8px 20px' }}
              onClick={startOAuth} disabled={!apiKey}>
              🔐 Login with Upstox
            </button>
            {token && (
              <button className="btn btn-ghost" onClick={testToken} disabled={testing}>
                {testing ? <span className="loader" style={{ width: 12, height: 12 }} /> : '🔍 Test Connection'}
              </button>
            )}
          </div>

          {status && (
            <div style={{ marginTop: 12, fontSize: 12, padding: '8px 12px', borderRadius: 6,
              background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)' }}>
              {status}
            </div>
          )}
        </div>

        {/* Manual Token (advanced) */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            📋 Manual Token (Advanced)
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
            If you already have a token from Upstox, paste it here directly.
          </div>
          <input className="inp" type="password" value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste access token manually..." />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => {
              localStorage.setItem('upstox_token', token);
              setStatus('✅ Token saved manually.');
            }}>💾 Save Token</button>
            <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={clearAll}>
              🗑️ Clear All
            </button>
          </div>
        </div>

        {/* Setup Guide */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>📖 Setup Guide</div>
          {[
            ['1', 'Go to upstox.com/developer → Create an App'],
            ['2', `Set Redirect URL to: ${REDIRECT_URI}`],
            ['3', 'Copy your API Key and Secret → paste above → Save Credentials'],
            ['4', 'Click "Login with Upstox" every morning before trading'],
            ['5', 'Token auto-saves — Dashboard & Option Chain go live instantly'],
          ].map(([n, t]) => (
            <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
              <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: '50%', width: 22, height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{n}</span>
              <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{t}</span>
            </div>
          ))}
        </div>

        {/* Data Sources */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>📡 Data Sources</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 2 }}>
            <div>🟢 <strong>Upstox API</strong> — Real-time tick-by-tick data (requires token)</div>
            <div>🔵 <strong>NSE India</strong> — Live polling fallback (3s delay, no BSE)</div>
            <div>🟡 <strong>Yahoo Finance</strong> — Last resort for dashboard only</div>
          </div>
        </div>

      </div>
    </Layout>
  );
}
