const express = require('express');
const yts = require('yt-search');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const app = express();
const PORT = 3000;

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
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/audio', async (req, res) => {
  const id = req.query.id;
  
  if (!id) {
    return res.status(400).json({ error: "Video ID kosong" });
  }

  const url = `https://www.youtube.com/watch?v=${id}`;
  console.log(`[AUDIO] Processing: ${id}`);

  try {
    // Dapatkan URL audio langsung menggunakan yt-dlp
    const { stdout } = await execAsync(
      `yt-dlp -f "bestaudio" --get-url "${url}"`,
      { timeout: 15000 }
    );

    const audioUrl = stdout.trim();
    console.log(`[AUDIO] Direct URL obtained`);

    // Redirect ke URL audio langsung
    res.redirect(audioUrl);

  } catch (err) {
    console.error("[AUDIO ERROR]:", err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});