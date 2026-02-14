const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const app = express();

const PORT = process.env.PORT || 8080; // Railway akan mengisi ini otomatis

app.use(cors());

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Isi query-nya!" });

    try {
        // Ambil data langsung dari YouTube via yt-search (Jauh lebih stabil)
        const r = await yts(query);
        const results = r.videos.slice(0, 15).map(v => ({
            id: v.videoId,
            title: v.title,
            duration: v.timestamp,
            author: v.author.name,
            thumbnail: v.thumbnail,
            download_url: `https://www.youtubeapi.tv/api/button/mp3/${v.videoId}`
        }));

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Backend jalan di port ${PORT}`));