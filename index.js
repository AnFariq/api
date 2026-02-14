const express = require('express');
const yts = require('yt-search');
const ytdl = require('ytdl-core');

const app = express();
const PORT = 3000;

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
            download_url: `/audio?id=${v.videoId}`
        }));

        res.json({ success: true, data: results });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Gagal ambil data",
            error: error.message
        });
    }
});

app.get('/audio', async (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).send("Video ID kosong");

    const url = `https://www.youtube.com/watch?v=${id}`;

    try {
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, {
            quality: 'highestaudio'
        });

        res.setHeader('Content-Type', format.mimeType);
        res.setHeader('Accept-Ranges', 'bytes');

        ytdl(url, { format }).pipe(res);

    } catch (err) {
        res.status(500).send("Gagal stream audio");
    }
});

app.listen(PORT, () =>
    console.log(`Backend jalan di http://localhost:${PORT}`)
);
