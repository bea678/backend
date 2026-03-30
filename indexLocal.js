import 'dotenv/config';
import express from 'express';
import { PORT } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'node:child_process';

const app = express();

app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
    res.json('holabea');
})

app.get('/download', (req, res) => {
    const videoId = req.query.id;

    if (!videoId) {
        return res.status(400).send('Debes proporcionar un ID de YouTube');
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Headers para que el navegador/app identifique el archivo
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);

    // PARÁMETROS ANTIBLOQUEO:
    // 1. --impersonate-client: Hace que yt-dlp simule ser un navegador específico.
    // 2. --no-check-certificates: Evita errores de SSL comunes en Railway.
    // 3. --extractor-args: Forzamos el uso de reproductores que piden menos verificación.
    const yt = spawn('yt-dlp', [
        '--no-check-certificates',
        '--quiet',
        '--no-warnings',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--impersonate-client', 'chrome', // Simula un navegador real
        '--extractor-args', 'youtube:player_client=android,web', // Prueba varios clientes
        '-o', '-', // Salida a stdout
        videoUrl
    ]);

    // Enviamos el audio directamente al cliente
    yt.stdout.pipe(res);

    // Logs de error para depurar en la consola de Railway
    yt.stderr.on('data', (data) => {
        console.error(`[yt-dlp error]: ${data.toString()}`);
    });

    // IMPORTANTE: Si el usuario cancela en el móvil, matamos el proceso en el server
    req.on('close', () => {
        if (!yt.killed) {
            yt.kill('SIGTERM');
            console.log(`Descarga cancelada por el usuario: ${videoId}`);
        }
    });

    yt.on('close', (code) => {
        if (code !== 0 && !res.headersSent) {
            console.error(`yt-dlp terminó con código ${code}`);
            // No podemos enviar res.status si los headers ya se enviaron
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running en:${PORT}`);
});