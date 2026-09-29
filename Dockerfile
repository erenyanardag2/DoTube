# Node.js ve Python içeren resmi Docker imajı
FROM node:20-slim

# yt-dlp için gerekli sistem bağımlılıklarını ve Python'u yüklüyoruz
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp'yi yüklüyoruz
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Çalışma dizinini ayarlıyoruz
WORKDIR /app

# Package dosyalarını kopyalayıp bağımlılıkları yüklüyoruz
COPY package*.json ./
RUN npm install

# Proje dosyalarını kopyalıyoruz
COPY . .

# Port ayarı (Railway otomatik PORT environment variable verir)
EXPOSE 3000

# Uygulamayı başlatıyoruz
CMD ["node", "server.js"]