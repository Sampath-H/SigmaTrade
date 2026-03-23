import Layout from '../components/Layout';
export default function Positions() {
  return (
    <Layout title="Positions" subtitle="Open positions and P&L">
      <div className="card" style={{textAlign:'center',padding:40,color:'var(--text3)'}}>
        <div style={{fontSize:32,marginBottom:12}}>💼</div>
        <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Positions</div>
        <div style={{fontSize:12}}>Open positions from the Option Chain tab appear here.</div>
      </div>
    </Layout>
  );
}
