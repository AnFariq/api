const express = require('express');
const yts = require('yt-search');
const axios = require('axios');
const play = require('play-dl');
const app = express();

const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Music API v4.0 (With Proxy)...');
console.log('📍 Node:', process.version);
console.log('📍 Port:', PORT);

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// === CORS PROXIES (untuk bypass Railway/Vercel network block) ===
const PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors-anywhere.herokuapp.com/',
  'https://thingproxy.freeboard.io/fetch/'
];

let proxyIdx = 0;
const getProxy = () => {
  const proxy = PROXIES[proxyIdx];
  proxyIdx = (proxyIdx + 1) % PROXIES.length;
  return proxy;
};

// Helper function: Fetch dengan proxy fallback
async function fetchWithProxy(url, options = {}) {
  const timeout = options.timeout || 8000;
  
  // Try direct first (untuk local/Fly.io)
  try {
    console.log(`   → Direct: ${url.substring(0, 50)}...`);
    const response = await axios.get(url, { 
      ...options, 
      timeout 
    });
    console.log(`   ✓ Direct success`);
    return response;
  } catch (directError) {
    console.log(`   ✗ Direct failed: ${directError.code || directError.message}`);
    
    // Fallback to proxies
    for (let i = 0; i < PROXIES.length; i++) {
      const proxy = getProxy();
      try {
        const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
        console.log(`   → Proxy ${i + 1}/${PROXIES.length}: ${proxy.substring(0, 30)}...`);
        
        const response = await axios.get(proxyUrl, { 
          timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0',
            ...(options.headers || {})
          }
        });
        
        console.log(`   ✓ Proxy success`);
        return response;
      } catch (proxyError) {
        console.log(`   ✗ Proxy failed: ${proxyError.code || proxyError.message}`);
        continue;
      }
    }
    
    // All failed
    throw new Error('All proxy attempts failed');
  }
}

// === BACKEND INSTANCES ===
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.protokolla.fi',
  'https://iv.nboeck.de',
  'https://invidious.private.coffee',
  'https://yt.artemislena.eu'
];

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.palveluntarjoaja.eu',
  'https://api.piped.privacydev.net'
];

let invIdx = 0;
const getInv = () => {
  const inst = INVIDIOUS[invIdx];
  invIdx = (invIdx + 1) % INVIDIOUS.length;
  return inst;
};

let pipedIdx = 0;
const getPiped = () => {
  const inst = PIPED[pipedIdx];
  pipedIdx = (pipedIdx + 1) % PIPED.length;
  return inst;
};

// === ROUTES ===
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '4.0-proxy',
    message: 'Multi-Backend Music API with Proxy Support',
    features: ['CORS Proxy', 'Multiple Backends', 'Auto Fallback'],
    backends: ['Invidious', 'Piped', 'play-dl'],
    proxies: PROXIES.length,
    endpoints: {
      search: '/search?q=song',
      audio: '/audio?id=videoId'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// === SEARCH ===
app.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "Parameter 'q' required" });

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

// === AUDIO - WITH PROXY SUPPORT ===
app.get('/audio', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Parameter 'id' required" });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎵 AUDIO REQUEST: ${id}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ===== STRATEGY 1: Piped with Proxy =====
  console.log('🔷 [1/3] Trying Piped API (with proxy fallback)...');
  for (let i = 0; i < PIPED.length; i++) {
    const inst = getPiped();
    try {
      console.log(`\n   Instance: ${inst}`);
      
      const response = await fetchWithProxy(
        `${inst}/streams/${id}`,
        {
          timeout: 8000,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );

      const data = response.data;
      const audios = (data.audioStreams || []).filter(f => f.url);

      if (audios.length > 0) {
        const best = audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        
        console.log(`\n   ✅ SUCCESS via Piped!`);
        console.log(`   Bitrate: ${best.bitrate}kbps`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        return res.json({
          success: true,
          backend: 'piped',
          instance: inst,
          data: {
            url: best.url,
            type: best.mimeType || 'audio/mp4',
            quality: best.quality || 'AUDIO',
            bitrate: best.bitrate * 1000,
            title: data.title,
            author: data.uploader,
            duration: data.duration
          }
        });
      }
      
      console.log(`   ⚠ No audio streams found`);
    } catch (e) {
      console.log(`   ✗ Instance failed`);
    }
  }

  // ===== STRATEGY 2: Invidious with Proxy =====
  console.log('\n🔶 [2/3] Trying Invidious API (with proxy fallback)...');
  for (let i = 0; i < INVIDIOUS.length; i++) {
    const inst = getInv();
    try {
      console.log(`\n   Instance: ${inst}`);
      
      const response = await fetchWithProxy(
        `${inst}/api/v1/videos/${id}`,
        {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }
      );

      const data = response.data;
      const audios = (data.adaptiveFormats || [])
        .filter(f => f.type && f.type.includes('audio') && f.url);

      if (audios.length > 0) {
        const best = audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        
        console.log(`\n   ✅ SUCCESS via Invidious!`);
        console.log(`   Bitrate: ${best.bitrate}bps`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        return res.json({
          success: true,
          backend: 'invidious',
          instance: inst,
          data: {
            url: best.url,
            type: best.type,
            bitrate: best.bitrate,
            title: data.title,
            author: data.author,
            duration: data.lengthSeconds
          }
        });
      }
      
      console.log(`   ⚠ No audio formats found`);
    } catch (e) {
      console.log(`   ✗ Instance failed`);
    }
  }

  // ===== STRATEGY 3: play-dl (Direct - no proxy needed) =====
  console.log('\n🔸 [3/3] Trying play-dl (direct extraction)...');
  try {
    console.log(`   → Extracting via play-dl`);
    
    const info = await play.video_info(`https://www.youtube.com/watch?v=${id}`);
    const audioFormats = info.format.filter(f => !f.video_codec && f.url);
    
    if (audioFormats.length > 0) {
      const best = audioFormats.sort((a, b) => 
        (b.bitrate || 0) - (a.bitrate || 0)
      )[0];
      
      console.log(`\n   ✅ SUCCESS via play-dl!`);
      console.log(`   Quality: ${best.quality}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      return res.json({
        success: true,
        backend: 'play-dl',
        data: {
          url: best.url,
          type: 'audio/mp4',
          quality: best.quality,
          bitrate: best.bitrate || 128000,
          title: info.video_details.title,
          author: info.video_details.channel?.name,
          duration: info.video_details.durationInSec
        }
      });
    }
    
    console.log(`   ⚠ No audio format available`);
  } catch (e) {
    console.log(`   ✗ play-dl failed: ${e.message}`);
  }

  // ===== ALL FAILED =====
  console.log('\n❌ ALL BACKENDS FAILED');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  res.status(503).json({ 
    success: false, 
    error: 'All backends and proxies failed',
    videoId: id,
    triedBackends: ['piped', 'invidious', 'play-dl'],
    triedProxies: PROXIES.length,
    suggestion: 'Video may be restricted, age-gated, or try again later'
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    availableEndpoints: ['/', '/health', '/search', '/audio']
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   SERVER RUNNING (Proxy Mode)`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Backends: ${INVIDIOUS.length + PIPED.length} instances`);
  console.log(`   Proxies: ${PROXIES.length} fallbacks`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

server.on('error', (e) => {
  console.error('❌ Server error:', e);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => process.exit(0));
});