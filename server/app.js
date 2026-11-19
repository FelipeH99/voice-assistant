import express from 'express';

export function createApp({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  const app = express();
  let lastRequest = -Infinity;
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/status', (req, res) => res.json({ configured: Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID) }));
  app.post('/api/session', async (req, res) => {
    // Local-only MVP: reject cross-origin requests and require a non-simple header.
    if (req.get('Origin') !== 'http://127.0.0.1:5190' || req.get('X-Voice-Client') !== 'local') {
      return res.status(403).json({ error: 'Origen no permitido.' });
    }
    if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_AGENT_ID) {
      return res.status(503).json({ error: 'Configurá ElevenLabs en el archivo .env del servidor.' });
    }
    if (now() - lastRequest < 10000) return res.status(429).json({ error: 'Esperá unos segundos antes de reconectar.' });
    lastRequest = now();
    try {
      const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
      url.searchParams.set('agent_id', env.ELEVENLABS_AGENT_ID);
      const response = await fetcher(url, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('provider');
      const data = await response.json();
      if (typeof data.signed_url !== 'string' || !data.signed_url.startsWith('wss://api.elevenlabs.io/')) throw new Error('invalid response');
      res.json({ signedUrl: data.signed_url });
    } catch {
      res.status(502).json({ error: 'No se pudo iniciar la sesión con ElevenLabs. Revisá la configuración o intentá nuevamente.' });
    }
  });
  return app;
}
