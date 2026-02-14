const express = require('express');
const yts = require('yt-search');
const axios = require('axios');
const play = require('play-dl');
const app = express();

const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Music API v3.0...');
console.log('📍 Node:', process.version);
console.log('📍 Port:', PORT);

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// === UPDATED WORKING INSTANCES (Tested Feb 2026) ===

// Invidious - Updated list
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.protokolla.fi',
  'https://iv.nboeck.de',
  'https://invidious.private.coffee',
  'https://yt.artemislena.eu'
];

// Piped - Updated list
const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.palveluntarjoaja.eu',
  'https://api.piped.privacydev.net'
];

// === Helper Functions ===
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

// === Routes ===
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '3.0',
    message: 'Multi-Backend Music API',
    backends: ['Invidious', 'Piped', 'play-dl'],
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

// === Search ===
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

// === Audio - IMPROVED VERSION ===
app.get('/audio', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Parameter 'id' required" });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎵 AUDIO REQUEST: ${id}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ===== STRATEGY 1: Piped (Fastest & Most Reliable) =====
  console.log('🔷 [1/3] Trying Piped API...');
  for (let i = 0; i < PIPED.length; i++) {
    const inst = getPiped();
    try {
      console.log(`   ↳ ${inst}`);
      
      const { data } = await axios.get(`${inst}/streams/${id}`, {
        timeout: 6000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const audios = (data.audioStreams || []).filter(f => f.url);

      if (audios.length > 0) {
        // Sort by bitrate and get best
        const best = audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        
        console.log(`   ✅ SUCCESS! Bitrate: ${best.bitrate}kbps`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        return res.json({
          success: true,
          backend: 'piped',
          instance: inst,
          data: {
            url: best.url,
            type: best.mimeType || 'audio/mp4',
            quality: best.quality || 'AUDIO',
            bitrate: best.bitrate * 1000, // Convert to bps
            title: data.title,
            author: data.uploader,
            duration: data.duration
          }
        });
      }
      
      console.log(`   ✗ No audio streams found`);
    } catch (e) {
      const status = e.response?.status || e.code || e.message;
      console.log(`   ✗ Failed: ${status}`);
    }
  }

  // ===== STRATEGY 2: Invidious =====
  console.log('\n🔶 [2/3] Trying Invidious API...');
  for (let i = 0; i < INVIDIOUS.length; i++) {
    const inst = getInv();
    try {
      console.log(`   ↳ ${inst}`);
      
      const { data } = await axios.get(`${inst}/api/v1/videos/${id}`, {
        timeout: 6000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const audios = (data.adaptiveFormats || [])
        .filter(f => f.type && f.type.includes('audio') && f.url);

      if (audios.length > 0) {
        // Sort by bitrate
        const best = audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        
        console.log(`   ✅ SUCCESS! Bitrate: ${best.bitrate}bps`);
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
      
      console.log(`   ✗ No audio formats found`);
    } catch (e) {
      const status = e.response?.status || e.code || e.message;
      console.log(`   ✗ Failed: ${status}`);
    }
  }

  // ===== STRATEGY 3: play-dl (Last Resort) =====
  console.log('\n🔸 [3/3] Trying play-dl...');
  try {
    console.log(`   ↳ Extracting via play-dl`);
    
    const info = await play.video_info(`https://www.youtube.com/watch?v=${id}`);
    
    // Filter audio-only formats
    const audioFormats = info.format.filter(f => 
      !f.video_codec && f.url
    );
    
    if (audioFormats.length > 0) {
      // Get highest quality
      const best = audioFormats.sort((a, b) => 
        (b.bitrate || 0) - (a.bitrate || 0)
      )[0];
      
      console.log(`   ✅ SUCCESS! Quality: ${best.quality}`);
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
    
    console.log(`   ✗ No audio format available`);
  } catch (e) {
    console.log(`   ✗ Failed: ${e.message}`);
  }

  // ===== ALL STRATEGIES FAILED =====
  console.log('\n❌ ALL BACKENDS FAILED');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  res.status(503).json({ 
    success: false, 
    error: 'All backends unavailable. The video may be restricted, age-gated, or temporarily unavailable.',
    videoId: id,
    triedBackends: ['piped', 'invidious', 'play-dl'],
    suggestion: 'Try a different video or retry in a few minutes'
  });
});

// 404 handler
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

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   SERVER RUNNING`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Backends: ${INVIDIOUS.length + PIPED.length} instances`);
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