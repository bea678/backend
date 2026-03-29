# Usamos Node 20 como base
FROM node:20-slim

# Instalamos Python3 y FFmpeg de forma permanente
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Creamos el directorio de trabajo
WORKDIR /app

# Copiamos archivos de dependencias e instalamos
COPY package*.json ./
RUN npm install

# Copiamos todo el código (incluyendo tus scripts de scrapping)
COPY . .

# Railway usa la variable PORT automáticamente
EXPOSE 3000

# Comando para arrancar la aplicación
CMD ["node", "index.js"]
