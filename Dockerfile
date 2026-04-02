FROM node:20-slim

# Instalamos las dependencias necesarias para Chrome + tus herramientas de Python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    # --- DEPENDENCIAS DE CHROME ---
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install pytubefix --break-system-packages

WORKDIR /app

COPY package*.json ./
# Forzamos a Puppeteer a descargar el navegador durante la construcción
RUN npm install

COPY . .

# Variable de entorno para que Puppeteer sepa dónde está el navegador en Linux
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

EXPOSE 8080

CMD ["node", "index.js"]