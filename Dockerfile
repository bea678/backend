FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --upgrade pytubefix --break-system-packages

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Exponemos el puerto
EXPOSE 3000

# Lanzamos la app
CMD ["node", "index.js"]