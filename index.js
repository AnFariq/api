const express = require('express');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const app = express();
const PORT = 3000;

// Middleware logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// PENTING: Buat cookies.json dari browser kamu (lihat cara di bawah)
let cookies = [];
try {
  if (fs.existsSync('./cookies.json')) {
    cookies = JSON.parse(fs.readFileSync('./cookies.json', 'utf8'));
    console.log('[INIT] Cookies loaded:', cookies.length, 'cookies');
  }
} catch (err) {
  console.warn('[INIT] No cookies file found, proceeding without cookies');
}

app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Query kosong" });
  
  try {
    const r = await yts(query);
    const videos = r.videos.slice(0, 15);
    const results = videos.map(v => ({
      id: v.videoId,
      title: v.title,
      duration: v.timestamp,
      author: v.author.name,
      thumbnail: v.thumbnail,
    }));
    
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("SEARCH ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Gagal ambil data", 
      error: error.message 
    });
  }
});

app.get('/audio', async (req, res) => {
  const id = req.query.id;
  
  if (!id) {
    return res.status(400).json({ 
      success: false, 
      error: "Video ID kosong" 
    });
  }

  const url = `https://www.youtube.com/watch?v=${id}`;
  console.log(`[AUDIO] Processing: ${id}`);

  try {
    req.setTimeout(45000);
    
    // Buat agent dengan cookies
    const agent = ytdl.createAgent(cookies);

    console.log(`[AUDIO] Fetching info with cookies...`);
    
    // Options untuk bypass 403
    const info = await ytdl.getInfo(url, { 
      agent,
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Sec-Fetch-Mode': 'navigate',
        }
      }
    });

    console.log(`[AUDIO] Info retrieved: ${info.videoDetails.title}`);

    // Filter audio formats
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    if (audioFormats.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Tidak ada format audio tersedia' 
      });
    }

    // Pilih format terbaik
    const format = audioFormats.reduce((best, current) => {
      const bestBitrate = parseInt(best.audioBitrate) || 0;
      const currentBitrate = parseInt(current.audioBitrate) || 0;
      return currentBitrate > bestBitrate ? current : best;
    });

    console.log(`[AUDIO] Format: ${format.mimeType}, bitrate: ${format.audioBitrate}kbps`);

    // Set response headers
    res.setHeader('Content-Type', format.mimeType || 'audio/webm');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (format.contentLength) {
      res.setHeader('Content-Length', format.contentLength);
    }

    // Start streaming dengan options tambahan
    const stream = ytdl(url, { 
      format: format,
      agent: agent,
      highWaterMark: 1024 * 1024 * 4, // 4MB buffer
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
      }
    });

    stream.on('error', (err) => {
      console.error('[STREAM ERROR]:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: err.message 
        });
      } else {
        stream.destroy();
      }
    });

    req.on('close', () => {
      console.log('[AUDIO] Client disconnected');
      stream.destroy();
    });

    let bytes = 0;
    stream.on('data', (chunk) => { bytes += chunk.length; });
    stream.on('end', () => console.log(`[AUDIO] Done. Streamed ${(bytes/1024/1024).toFixed(2)}MB`));

    stream.pipe(res);

  } catch (err) {
    console.error("[AUDIO ERROR]:", err.message);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: err.message,
        hint: err.message.includes('403') ? 'YouTube blocked the request. Try updating cookies.' : undefined
      });
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    cookies: cookies.length > 0 ? 'loaded' : 'not loaded',
    timestamp: new Date().toISOString() 
  });
});

app.listen(PORT, () => {
  console.log(`Backend jalan di http://localhost:${PORT}`);
});