const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

// Ortak yt-dlp parametreleri (YouTube IP engellerini aşmak için Mobil İstemci simülasyonu)
const YTDLP_ARGS = `--extractor-args "youtube:player_client=android,web" --js-runtimes node`;

app.post('/api/formats', (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Geçerli bir URL girin.' });
    }

    // Mobil istemci emülasyonu ile YouTube 429 IP bloğunu baypas ediyoruz
    const command = `yt-dlp --extractor-args "youtube:player_client=android,web" -J "${url}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Format çekme hatası:', stderr || error.message);
            return res.status(500).json({ error: 'Video bilgisi alınamadı.' });
        }

        try {
            const info = JSON.parse(stdout);
            const formats = info.formats || [];

            const heights = [...new Set(
                formats
                    .filter(f => f.height && f.vcodec !== 'none')
                    .map(f => f.height)
            )].sort((a, b) => b - a);

            res.json({
                title: info.title,
                thumbnail: info.thumbnail,
                qualities: heights
            });
        } catch (e) {
            res.status(500).json({ error: 'Video formatları işlenemedi.' });
        }
    });
});

// 2. ADIM: İndirme ve Gönderme
app.post('/api/download-file', (req, res) => {
    const { url, quality } = req.body;

    if (!url || !quality) {
        return res.status(400).send('Eksik parametre.');
    }

    const timestamp = Date.now();
    const tempFilePath = path.join(downloadsDir, `temp_${timestamp}.mp4`);

    const command = `yt-dlp ${YTDLP_ARGS} -f "bv*[height<=${quality}][ext=mp4]+ba[ext=m4a]/b[height<=${quality}]/best" --concurrent-fragments 5 -o "${tempFilePath}" "${url}"`;

    console.log(`[Sunucuda İşleniyor] Kalite: ${quality}p | URL: ${url}`);

    exec(command, { maxBuffer: 1024 * 1024 * 20 }, (error) => {
        if (error || !fs.existsSync(tempFilePath)) {
            console.error('İndirme/İşleme Hatası:', error?.message);
            return res.status(500).send('Video hazırlanamadı.');
        }

        const titleCommand = `yt-dlp ${YTDLP_ARGS} --get-title "${url}"`;

        exec(titleCommand, (tErr, tStdout) => {
            let rawTitle = tStdout ? tStdout.trim() : 'valorant_klip';
            let safeTitle = rawTitle.replace(/[/\\?%*:|"<>]/g, '');

            const stat = fs.statSync(tempFilePath);

            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': stat.size,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(safeTitle)}.mp4"`
            });

            const readStream = fs.createReadStream(tempFilePath);
            readStream.pipe(res);

            readStream.on('end', () => {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                console.log(`[Başarıyla Gönderildi] ${safeTitle}.mp4`);
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu Hazır: Port ${PORT}`);
});