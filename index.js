const express = require('express');
const yts = require('yt-search');
const cors = require('cors'); // Tambahkan ini (WAJIB buat Flutter Web)
const app = express();

// Railway bakal kasih port sendiri, jangan dipaksa ke 3000
const PORT = process.env.PORT || 3000; 

app.use(cors()); // Aktifkan ini

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Isi query-nya dulu!" });

    try {
        const r = await yts(query);
        const videos = r.videos.slice(0, 15);

        const results = videos.map(v => ({
            id: v.videoId,
            title: v.title,
            duration: v.timestamp,
            author: v.author.name,
            thumbnail: v.thumbnail,
            url: v.url,
            download_url: `https://www.youtubeapi.tv/api/button/mp3/${v.videoId}`
        }));

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Gagal ambil data musik.",
            error: error.message
        });
    }
});

// Gunakan 0.0.0.0 agar bisa diakses secara publik di Railway
app.listen(PORT, '0.0.0.0', () => console.log(`Backend jalan di port ${PORT}`));