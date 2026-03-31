import 'dotenv/config';
import express from 'express';
import { PORT } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; // Asegúrate de importar fs arriba del todo

const app = express();

app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
    res.json('holabea');
})

app.get('/download', (req, res) => {
    const videoId = req.query.id; 
    const cookiesPath = './cookies.txt'; // Ruta en Railway

    // 1. Comprobamos si el archivo existe
    if (fs.existsSync(cookiesPath)) {
        console.log(`✅ Archivo de cookies encontrado en: ${cookiesPath}`);
        // Opcional: ver tamaño para saber si está vacío
        const stats = fs.statSync(cookiesPath);
        console.log(`📏 Tamaño del archivo: ${stats.size} bytes`);
    } else {
        console.error(`❌ ERROR: No se encontró cookies.txt en ${cookiesPath}`);
    }

  /*  const yt = spawn('yt-dlp', [
        '--no-check-certificates',
        '--quiet',
        '--no-warnings',
        '--cookies', cookiesPath,
        '--js-runtime', 'node', 
        '-f', '140/bestaudio[ext=m4a]/ba', 
        '-o', '-', 
        `https://www.youtube.com/watch?v=${videoId}`
    ]);*/

  const yt = spawn('yt-dlp', [
    '--no-check-certificates',
    // IMPORTANTE: NO ponemos el flag --cookies
    '--js-runtime', 'node',
    // Forzamos el cliente de Android, que es el más "abierto"
    '--extractor-args', 'youtube:player_client=android,web_embedded',
    '--user-agent', 'com.google.android.youtube/19.10.35 (Linux; U; Android 14; es_ES; Pixel 7 Pro)',
    // Usamos un filtrado de formato más flexible por si acaso
    '-f', 'ba[ext=m4a]/ba/best',
    '-o', '-', 
    `https://www.youtube.com/watch?v=${videoId}`
]);

    res.setHeader('Content-Type', 'audio/mp4'); 
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.m4a"`);

    yt.stdout.pipe(res);

    yt.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('ERROR') || msg.includes('cookie')) {
            console.error(`[yt-dlp log]: ${msg}`);
        }
    });

    req.on('close', () => yt.kill());
});

app.listen(PORT, () => {
    console.log(`🚀 Server running en:${PORT}`);
});