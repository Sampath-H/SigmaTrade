export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { instrument_key } = req.query;

  if (token && token !== 'MOCK_TOKEN') {
    try {
      const r = await fetch(
        `https://api.upstox.com/v2/option/contract/expiry?instrument_key=${encodeURIComponent(instrument_key)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (r.ok) {
        const d = await r.json();
        return res.json({ source: 'upstox', expiries: d.data || [] });
      }
    } catch {}
  }

  // Generate expiries
  const isBSE = instrument_key?.includes('BSE');
  const weekday = isBSE ? 4 : 2; // Thu=4 Tue=2
  const expiries = [];
  let d = new Date();
  while (expiries.length < 8) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === weekday) expiries.push(d.toISOString().split('T')[0]);
  }
  return res.json({ source: 'generated', expiries });
}
