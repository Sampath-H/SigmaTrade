import Layout from '../components/Layout';
export default function Orders() {
  return (
    <Layout title="Orders" subtitle="Order history and management">
      <div className="card" style={{textAlign:'center',padding:40,color:'var(--text3)'}}>
        <div style={{fontSize:32,marginBottom:12}}>📋</div>
        <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Order Book</div>
        <div style={{fontSize:12}}>Orders placed from the Option Chain tab appear here.</div>
      </div>
    </Layout>
  );
}
