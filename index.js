const express = require('express');
const yts = require('yt-search');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Invidious instances
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://vid.puffyan.us',
  'https://invidious.privacyredirect.com'
];

let instanceIndex = 0;
function getNextInstance() {
  const instance = INVIDIOUS_INSTANCES[instanceIndex];
  instanceIndex = (instanceIndex + 1) % INVIDIOUS_INSTANCES.length;
  return instance;
}

// Routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    endpoints: ['/search?q=query', '/audio?id=videoId', '/health']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: "Missing 'q' parameter" });
    }

    console.log(`Searching: ${query}`);
    const results = await yts(query);
    
    const videos = results.videos.slice(0, 15).map(v => ({
      id: v.videoId,
      title: v.title,
      duration: v.timestamp,
      author: v.author.name,
      thumbnail: v.thumbnail
    }));

    res.json({ success: true, data: videos });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/audio', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ error: "Missing 'id' parameter" });
    }

    console.log(`Getting audio for: ${id}`);

    for (let i = 0; i < INVIDIOUS_INSTANCES.length; i++) {
      const instance = getNextInstance();
      
      try {
        console.log(`Trying ${instance}...`);
        const { data } = await axios.get(
          `${instance}/api/v1/videos/${id}`,
          { timeout: 10000 }
        );

        const audioFormats = data.adaptiveFormats?.filter(f => 
          f.type && f.type.includes('audio')
        ) || [];

        if (audioFormats.length === 0) {
          throw new Error('No audio format found');
        }

        const best = audioFormats.reduce((a, b) => 
          (b.bitrate || 0) > (a.bitrate || 0) ? b : a
        );

        console.log(`Success! Bitrate: ${best.bitrate}`);
        return res.json({
          success: true,
          data: {
            url: best.url,
            type: best.type,
            bitrate: best.bitrate
          }
        });
      } catch (err) {
        console.error(`${instance} failed:`, err.message);
        continue;
      }
    }

    res.status(500).json({ success: false, error: 'All instances failed' });
  } catch (error) {
    console.error('Audio error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server started on 0.0.0.0:${PORT}`);
  console.log(`📍 Time: ${new Date().toISOString()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});