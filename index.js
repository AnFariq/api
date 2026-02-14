const express = require('express');
const yts = require('yt-search');
const axios = require('axios');
const play = require('play-dl');
const app = express();

const PORT = process.env.PORT || 8080;

console.log('🚀 Starting Multi-Backend Music API...');
console.log('📍 Node:', process.version);
console.log('📍 Port:', PORT);

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// === BACKEND 1: Invidious (updated working instances) ===
const INVIDIOUS = [
  'https://iv.ggtyler.dev',
  'https://invidious.fdn.fr',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://iv.melmac.space'
];

let invIdx = 0;
const getInvidiousInstance = () => {
  const inst = INVIDIOUS[invIdx];
  invIdx = (invIdx + 1) % INVIDIOUS.length;
  return inst;
};

// === BACKEND 2: Piped ===
const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://api-piped.mha.fi'
];

let pipedIdx = 0;
const getPipedInstance = () => {
  const inst = PIPED[pipedIdx];
  pipedIdx = (pipedIdx + 1) % PIPED.length;
  return inst;
};

// === Health ===
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Multi-Backend Music API',
    backends: {
      invidious: INVIDIOUS.length,
      piped: PIPED.length,
      playdl: 'enabled'
    },
    endpoints: {
      search: '/search?q=song',
      audio: '/audio?id=videoId'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// === Search ===
app.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "Missing 'q'" });

    console.log(`Search: "${q}"`);
    const r = await yts(q);
    
    const videos = r.videos.slice(0, 15).map(v => ({
      id: v.videoId,
      title: v.title,
      duration: v.timestamp,
      author: v.author.name,
      thumbnail: v.thumbnail,
      views: v.views
    }));

    res.json({ success: true, data: videos });
  } catch (e) {
    console.error('Search error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// === Audio - Multi-Backend Strategy ===
app.get('/audio', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing 'id'" });

  console.log(`\n=== AUDIO REQUEST: ${id} ===`);

  // STRATEGY 1: Try Invidious
  console.log('\n[STRATEGY 1] Trying Invidious...');
  for (let i = 0; i < INVIDIOUS.length; i++) {
    const inst = getInvidiousInstance();
    try {
      console.log(`  → ${inst}`);
      const { data } = await axios.get(`${inst}/api/v1/videos/${id}`, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const audios = (data.adaptiveFormats || [])
        .filter(f => f.type && f.type.includes('audio'));

      if (audios.length > 0) {
        const best = audios.reduce((a, b) => 
          (b.bitrate || 0) > (a.bitrate || 0) ? b : a
        );
        
        console.log(`  ✅ SUCCESS via Invidious: ${best.bitrate}bps`);
        return res.json({
          success: true,
          backend: 'invidious',
          data: {
            url: best.url,
            type: best.type,
            bitrate: best.bitrate,
            title: data.title
          }
        });
      }
    } catch (e) {
      console.log(`  ✗ ${e.response?.status || e.code || e.message}`);
    }
  }

  // STRATEGY 2: Try Piped
  console.log('\n[STRATEGY 2] Trying Piped...');
  for (let i = 0; i < PIPED.length; i++) {
    const inst = getPipedInstance();
    try {
      console.log(`  → ${inst}`);
      const { data } = await axios.get(`${inst}/streams/${id}`, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const audios = (data.audioStreams || [])
        .filter(f => f.url);

      if (audios.length > 0) {
        const best = audios.reduce((a, b) => 
          (b.bitrate || 0) > (a.bitrate || 0) ? b : a
        );
        
        console.log(`  ✅ SUCCESS via Piped: ${best.bitrate}kbps`);
        return res.json({
          success: true,
          backend: 'piped',
          data: {
            url: best.url,
            type: best.mimeType || 'audio/mp4',
            bitrate: best.bitrate * 1000,
            title: data.title
          }
        });
      }
    } catch (e) {
      console.log(`  ✗ ${e.response?.status || e.code || e.message}`);
    }
  }

  // STRATEGY 3: Try play-dl (last resort)
  console.log('\n[STRATEGY 3] Trying play-dl...');
  try {
    const info = await play.video_info(`https://www.youtube.com/watch?v=${id}`);
    const format = info.format.filter(f => f.quality === 'high' && !f.video_codec);
    
    if (format.length > 0) {
      const audio = format[0];
      console.log(`  ✅ SUCCESS via play-dl`);
      return res.json({
        success: true,
        backend: 'play-dl',
        data: {
          url: audio.url,
          type: 'audio/mp4',
          bitrate: audio.bitrate || 128000,
          title: info.video_details.title
        }
      });
    }
  } catch (e) {
    console.log(`  ✗ ${e.message}`);
  }

  // ALL FAILED
  console.log('\n❌ ALL BACKENDS FAILED');
  res.status(503).json({ 
    success: false, 
    error: 'All backends failed. Try again later.',
    videoId: id
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on 0.0.0.0:${PORT}\n`);
});

server.on('error', (e) => {
  console.error('❌ Server error:', e);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});