// pages/api/oauth-callback.js
// Exchanges Upstox authorization code for access token

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { code, apiKey, apiSecret, redirectUri } = req.body;

  if (!code || !apiKey || !apiSecret || !redirectUri) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const params = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      client_id:     apiKey,
      client_secret: apiSecret,
    });

    const r = await fetch('https://api.upstox.com/v2/login/authorization/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    const d = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: d.message || d.error || 'Token exchange failed' });
    }

    return res.json({
      access_token:  d.access_token,
      token_type:    d.token_type,
      expires_in:    d.expires_in,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
