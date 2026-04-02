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
    if (!videoId) return res.status(400).send('Falta el ID');

    // 1. Python descarga el archivo al disco duro del servidor
    const pythonProcess = spawn('python3', ['downloadMP3.py', videoId]);

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            const fileName = `${videoId}.mp3`;
            const filePath = path.resolve(fileName); // Ruta absoluta del archivo en el servidor

            if (fs.existsSync(filePath)) {
                // 2. Node envía el archivo del servidor al navegador (Chrome)
                res.download(filePath, `audio_${videoId}.mp3`, (err) => {
                    if (err) {
                        console.error("Error enviando a Chrome:", err);
                    }
                    // 3. Limpieza: Borramos el archivo del servidor después de enviarlo
                    fs.unlinkSync(filePath);
                });
            } else {
                res.status(500).send("Archivo no generado");
            }
        } else {
            res.status(500).send("Error en Python");
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running en:${PORT}`);
});