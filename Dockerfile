FROM node:20-slim

# Evitar prompts interactivos durante la instalación
ENV DEBIAN_FRONTEND=noninteractive

# 1. Instalamos Python, FFmpeg y herramientas necesarias
# Mantenemos ffmpeg porque es útil para manipular los archivos descargados
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Instalamos pytubefix
# Usamos --break-system-packages porque en las imágenes slim de Debian/Node 
# Python viene bloqueado para entornos globales, esto fuerza la instalación.
RUN pip3 install --no-cache-dir --upgrade pytubefix --break-system-packages

WORKDIR /app

# 3. Instalamos las dependencias de Node.js
# Copiamos primero los archivos de dependencias para aprovechar la caché de capas
COPY package*.json ./
RUN npm install --production

# 4. Copiamos el resto del código
COPY . .

# Exponemos el puerto
EXPOSE 3000

# Lanzamos la app
CMD ["node", "index.js"]