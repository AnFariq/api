const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log('🚀 Starting server...');
console.log('📍 Node version:', process.version);
console.log('📍 PORT:', PORT);
console.log('📍 HOST:', HOST);

// Basic health check FIRST (paling penting!)
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Import dependencies SETELAH basic routes
let yts, axios;
try {
  yts = require('yt-search');
  axios = require('axios');
  console.log('✅ Dependencies loaded successfully');
} catch (error) {
  console.error('❌ Failed to load dependencies:', error.message);
}

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

// Search endpoint
app.get('/search', async (req, res) => {
  try {
    if (!yts) {
      return res.status(503).json({ error: 'Search service not available' });
    }

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

// Audio endpoint
app.get('/audio', async (req, res) => {
  try {
    if (!axios) {
      return res.status(503).json({ error: 'Audio service not available' });
    }

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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server dengan error handling
const server = app.listen(PORT, HOST, (err) => {
  if (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
  console.log(`✅ Server listening on ${HOST}:${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Time: ${new Date().toISOString()}`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error('❌ Server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Catch unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});