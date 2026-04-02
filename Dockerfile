FROM node:20-slim

# Evitar prompts interactivos durante la instalación
ENV DEBIAN_FRONTEND=noninteractive

# 1. Instalamos Python, FFmpeg y herramientas necesarias
# FFmpeg es fundamental para que el audio se guarde correctamente en MP3
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Instalamos yt-dlp (más robusto que pytubefix para evitar bloqueos)
# Usamos --break-system-packages porque estamos en una imagen Debian-slim
RUN pip3 install --no-cache-dir --upgrade yt-dlp --break-system-packages

WORKDIR /app

# 3. Instalamos las dependencias de Node.js
COPY package*.json ./
RUN npm install --production

# 4. Copiamos el resto del código
COPY . .

# Exponemos el puerto
EXPOSE 3000

# Lanzamos la app
CMD ["node", "index.js"]