import { useRouter } from 'next/router';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const NAV = [
  { href: '/',              icon: '🏠', label: 'Dashboard'    },
  { href: '/option-chain',  icon: '📊', label: 'Option Chain' },
  { href: '/scanner',       icon: '🔍', label: 'Scanner'      },
  { href: '/backtest',      icon: '📈', label: 'Backtest'     },
  { href: '/orders',        icon: '📋', label: 'Orders'       },
  { href: '/positions',     icon: '💼', label: 'Positions'    },
  { href: '/settings',      icon: '⚙️', label: 'Settings'    },
];

export default function Layout({ children, title = 'SigmaTrade', subtitle = '' }) {
  const router = useRouter();
  const [token, setToken]   = useState('');
  const [isDemo, setIsDemo] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('upstox_token') || '';
    setToken(t);
    setIsDemo(!t || t === 'MOCK_TOKEN');
  }, []);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Sigma<span>Trade</span></h1>
          <p>Algorithmic Trading</p>
        </div>

        <div style={{padding:'8px 0', flex:1}}>
          <div className="nav-section">Navigation</div>
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className={`nav-item${router.pathname === n.href ? ' active' : ''}`}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </div>

        <div className="sidebar-bottom">
          {/* Mode badge */}
          <div style={{marginBottom:10, textAlign:'center'}}>
            <span className={`badge ${isDemo ? 'badge-demo' : 'badge-live'}`}>
              <span className="blink" style={{width:6,height:6,borderRadius:'50%',
                background: isDemo ? '#fbbf24' : '#4ade80', display:'inline-block'}} />
              {isDemo ? 'DEMO MODE' : 'LIVE'}
            </span>
          </div>
          <div className="user-card">
            <div className="user-avatar">S</div>
            <div>
              <div className="user-name">Trader</div>
              <div className="user-email">{isDemo ? 'Demo account' : 'Upstox connected'}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {/* Top bar */}
        <div className="topbar">
          <div>
            <div className="topbar-title">{title}</div>
            {subtitle && <div className="topbar-sub">{subtitle}</div>}
          </div>
          <div className="topbar-right">
            <span style={{fontSize:11, color:'var(--text3)'}}>
              {new Date().toLocaleTimeString('en-IN')}
            </span>
            {isDemo && (
              <Link href="/settings">
                <button className="btn btn-ghost" style={{fontSize:11, padding:'5px 10px'}}>
                  🔑 Connect Upstox
                </button>
              </Link>
            )}
          </div>
        </div>

        <div style={{padding:'16px 20px'}}>
          {children}
        </div>
      </main>
    </div>
  );
}
