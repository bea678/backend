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

    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);
    res.setHeader('Content-Type', 'audio/mpeg');

    const yt = spawn('yt-dlp', [
        '-x',                     // Extraer audio
        '--audio-format', 'mp3',  // Formato de salida
        '--audio-quality', '0',   // Mejor calidad
        '-o', '-',                // Enviar a la salida estándar (stdout)
        `https://www.youtube.com/watch?v=${videoId}`
    ]);

    // Redirigimos la salida del proceso directamente a la respuesta de Express
    yt.stdout.pipe(res);

    // Manejo de errores del proceso
    yt.stderr.on('data', (data) => {
        console.error(`Error de yt-dlp: ${data}`);
    });

    yt.on('close', (code) => {
        if (code !== 0) {
            console.error(`El proceso yt-dlp terminó con código de error ${code}`);
            // Si hay error y aún no se han enviado cabeceras, avisamos al cliente
            if (!res.headersSent) {
                res.status(500).send('Error al procesar el audio');
            }
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running en:${PORT}`);
});