export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key, transaction_type, quantity, price, order_type, product } = req.body;

  if (!token || token === 'MOCK_TOKEN') {
    return res.json({ status: 'PAPER', order_id: 'PAPER_' + Date.now(),
      message: `Paper ${transaction_type} ${quantity} @ ${price || 'MARKET'}` });
  }
  try {
    const r = await fetch('https://api.upstox.com/v2/order/place', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        quantity, product, validity: 'DAY', price: order_type === 'LIMIT' ? price : 0,
        tag: 'SigmaTrade', instrument_token: instrument_key,
        order_type: order_type || 'MARKET', transaction_type,
        disclosed_quantity: 0, trigger_price: 0, is_amo: false
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ status: 'ERROR', message: d?.errors?.[0]?.message || 'Failed' });
    return res.json({ status: 'LIVE', order_id: d?.data?.order_id, message: `${transaction_type} order placed` });
  } catch (e) {
    return res.status(500).json({ status: 'ERROR', message: e.message });
  }
}
