const express = require('express');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const app = express();
const PORT = 3000;

// Middleware untuk logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

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
  console.log(`[AUDIO] Memproses video: ${id}`);

  try {
    // Set timeout untuk request (30 detik)
    req.setTimeout(30000);
    
    // Buat agent dengan cookies (penting untuk bypass restrictions)
    const agent = ytdl.createAgent(undefined, {
      localAddress: undefined
    });

    console.log(`[AUDIO] Mengambil info video...`);
    
    // Ambil info dengan timeout
    const info = await Promise.race([
      ytdl.getInfo(url, { agent }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout getting video info')), 15000)
      )
    ]);

    console.log(`[AUDIO] Info didapat. Title: ${info.videoDetails.title}`);

    // Filter format audio only dan pilih kualitas terbaik
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    if (audioFormats.length === 0) {
      throw new Error('Tidak ada format audio tersedia');
    }

    // Pilih format dengan bitrate tertinggi
    const format = audioFormats.reduce((best, current) => {
      const bestBitrate = parseInt(best.audioBitrate) || 0;
      const currentBitrate = parseInt(current.audioBitrate) || 0;
      return currentBitrate > bestBitrate ? current : best;
    });

    console.log(`[AUDIO] Format dipilih: ${format.mimeType}, bitrate: ${format.audioBitrate}`);

    // Set headers SEBELUM streaming
    res.setHeader('Content-Type', format.mimeType || 'audio/webm');
    res.setHeader('Content-Length', format.contentLength || 0);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Tambahkan CORS jika diperlukan
    res.setHeader('Access-Control-Allow-Origin', '*');

    console.log(`[AUDIO] Mulai streaming...`);

    // Buat stream
    const audioStream = ytdl(url, { 
      format: format,
      agent: agent,
      highWaterMark: 1024 * 1024 * 2 // 2MB buffer
    });

    // Handle error pada stream
    audioStream.on('error', (err) => {
      console.error('[AUDIO STREAM ERROR]:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Stream error: ' + err.message 
        });
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      console.log('[AUDIO] Client disconnected, destroying stream');
      audioStream.destroy();
    });

    // Monitor progress
    let bytesStreamed = 0;
    audioStream.on('data', (chunk) => {
      bytesStreamed += chunk.length;
    });

    audioStream.on('end', () => {
      console.log(`[AUDIO] Stream selesai. Total bytes: ${bytesStreamed}`);
    });

    // Pipe ke response
    audioStream.pipe(res);

  } catch (err) {
    console.error("[AUDIO ERROR]:", err.message);
    console.error(err.stack);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: err.message || 'Gagal memproses audio',
        videoId: id
      });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

app.listen(PORT, () => {
  console.log(`Backend jalan di http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});