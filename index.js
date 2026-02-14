const express = require('express');
const yts = require('yt-search');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Daftar Invidious instances (diurutkan dari yang paling reliable)
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com',
  'https://vid.puffyan.us',
  'https://invidious.snopyta.org',
  'https://inv.riverside.rocks',
  'https://invidious.sethforprivacy.com',
  'https://y.com.sb'
];

let currentInstanceIndex = 0;

function getNextInstance() {
  const instance = INVIDIOUS_INSTANCES[currentInstanceIndex];
  currentInstanceIndex = (currentInstanceIndex + 1) % INVIDIOUS_INSTANCES.length;
  return instance;
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Music API is running',
    endpoints: {
      search: '/search?q=query',
      audio: '/audio?id=videoId',
      health: '/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    instances: INVIDIOUS_INSTANCES.length,
    timestamp: new Date().toISOString()
  });
});

// Search endpoint
app.get('/search', async (req, res) => {
  const query = req.query.q;
  
  if (!query) {
    return res.status(400).json({ 
      success: false, 
      error: "Query parameter 'q' is required" 
    });
  }

  try {
    console.log(`[SEARCH] Query: "${query}"`);
    const results = await yts(query);
    
    const videos = results.videos.slice(0, 15).map(v => ({
      id: v.videoId,
      title: v.title,
      duration: v.timestamp,
      author: v.author.name,
      thumbnail: v.thumbnails[v.thumbnails.length - 1].url, // Highest quality
      views: v.views,
      url: v.url
    }));

    console.log(`[SEARCH] Found ${videos.length} results`);
    res.json({ success: true, data: videos });

  } catch (error) {
    console.error('[SEARCH ERROR]:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search videos',
      message: error.message 
    });
  }
});

// Audio endpoint
app.get('/audio', async (req, res) => {
  const id = req.query.id;
  
  if (!id) {
    return res.status(400).json({ 
      success: false, 
      error: "Query parameter 'id' is required" 
    });
  }

  console.log(`[AUDIO] Requesting video: ${id}`);

  let lastError = null;
  
  // Try all instances
  for (let attempt = 0; attempt < INVIDIOUS_INSTANCES.length; attempt++) {
    const instance = getNextInstance();
    
    try {
      console.log(`[AUDIO] Trying ${instance} (attempt ${attempt + 1}/${INVIDIOUS_INSTANCES.length})`);
      
      const { data } = await axios.get(`${instance}/api/v1/videos/${id}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // Filter audio formats
      const audioFormats = data.adaptiveFormats
        ? data.adaptiveFormats.filter(f => f.type && f.type.includes('audio'))
        : [];

      if (audioFormats.length === 0) {
        throw new Error('No audio formats available');
      }

      // Select best audio format
      const bestAudio = audioFormats.reduce((best, current) => {
        const bestBitrate = best.bitrate || 0;
        const currentBitrate = current.bitrate || 0;
        return currentBitrate > bestBitrate ? current : best;
      });

      console.log(`[AUDIO] Success! Format: ${bestAudio.type}, Bitrate: ${bestAudio.bitrate}bps`);

      // Return direct audio URL
      return res.json({
        success: true,
        data: {
          url: bestAudio.url,
          type: bestAudio.type,
          bitrate: bestAudio.bitrate,
          title: data.title,
          author: data.author,
          duration: data.lengthSeconds
        }
      });

    } catch (error) {
      lastError = error;
      console.error(`[AUDIO] ${instance} failed:`, error.message);
      continue;
    }
  }

  // All instances failed
  console.error('[AUDIO] All instances failed');
  res.status(500).json({ 
    success: false, 
    error: 'All Invidious instances failed',
    message: lastError?.message || 'Unknown error',
    videoId: id
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Using ${INVIDIOUS_INSTANCES.length} Invidious instances`);
});