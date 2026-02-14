const express = require('express');
const cors = require('cors'); // Tambahkan ini
const yts = require('yt-search');
const app = express();

// Gunakan port dari environment variable (penting untuk Railway) atau default 3000
const PORT = process.env.PORT || 3000; 

// Aktifkan CORS agar Flutter Web bisa memanggil API ini
app.use(cors()); 

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Isi query-nya dulu cok!" });

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
            // Menggunakan API pihak ketiga untuk mendapatkan stream audio mp3
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

app.listen(PORT, () => console.log(`Backend Musik jalan di port ${PORT}`));