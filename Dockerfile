# 1. Usamos Node 20 como base
FROM node:20-slim

# 2. Instalamos Python3 (necesario para yt-dlp), FFmpeg y curl para bajar el binario
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 3. Descargamos yt-dlp directamente y le damos permisos de ejecución
# Lo ponemos en /usr/local/bin para que esté disponible en todo el sistema
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# 4. Creamos el directorio de trabajo
WORKDIR /app

# 5. Instalamos dependencias de Node
COPY package*.json ./
RUN npm install

# 6. Copiamos el resto del código
COPY . .

RUN ls -la /app && chmod 644 /app/cookies.txt || echo "Archivo no encontrado en el build"

# 7. Railway usa el puerto 3000 por defecto (o la variable PORT)
EXPOSE 3000

# 8. Arrancamos
CMD ["node", "index.js"]