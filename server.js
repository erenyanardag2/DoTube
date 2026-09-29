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

// 1. ADIM: Kaliteleri ve Video Başlığını Getirme
app.post('/api/formats', (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Geçerli bir URL girin.' });
    }

    const command = `yt-dlp --js-runtimes node -J "${url}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 15 }, (error, stdout) => {
        if (error) {
            console.error('Format çekme hatası:', error.message);
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

// 2. ADIM: Hızlı İndirme ve Orijinal İsmiyle Gönderme
// 2. ADIM: Hızlı İndirme ve Orijinal İsmiyle Gönderme
app.post('/api/download-file', (req, res) => {
    const { url, quality } = req.body;

    if (!url || !quality) {
        return res.status(400).send('Eksik parametre.');
    }

    const timestamp = Date.now();
    const tempFilePath = path.join(downloadsDir, `temp_${timestamp}.mp4`);

    // Hızlı indirme parametreleri
    const command = `yt-dlp --remote-components ejs:github -f "bv*[height<=${quality}][ext=mp4]+ba[ext=m4a]/b[height<=${quality}]/best" --concurrent-fragments 5 -o "${tempFilePath}" "${url}"`;

    console.log(`[Sunucuda İşleniyor] Kalite: ${quality}p | URL: ${url}`);

    // 1. AŞAMA: Sunucu videoyu YouTube'dan çekip hazırlıyor
    exec(command, { maxBuffer: 1024 * 1024 * 20 }, (error) => {
        if (error || !fs.existsSync(tempFilePath)) {
            console.error('İndirme/İşleme Hatası:', error?.message);
            return res.status(500).send('Video hazırlanamadı.');
        }

        // 2. AŞAMA: YouTube Başlığını alıyoruz
        const titleCommand = `yt-dlp --get-title "${url}"`;

        exec(titleCommand, (tErr, tStdout) => {
            let rawTitle = tStdout ? tStdout.trim() : 'valorant_klip';
            let safeTitle = rawTitle.replace(/[/\\?%*:|"<>]/g, '');

            // Dosya boyutunu öğrenip tarayıcıya bildiriyoruz (İndirme yüzdesi görünmesi için)
            const stat = fs.statSync(tempFilePath);

            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': stat.size,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(safeTitle)}.mp4"`
            });

            // 3. AŞAMA: İnternet hızının tamamını kullanarak tarayıcıya doğrudan aktarıyoruz
            const readStream = fs.createReadStream(tempFilePath);
            readStream.pipe(res);

            readStream.on('end', () => {
                // Aktarım bitince sunucudaki geçici dosyayı siliyoruz
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