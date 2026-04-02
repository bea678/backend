import express from 'express';
import { spawn } from 'node:child_process';
import path from 'path';
import fs from 'fs';

const router = express.Router();

router.get('/download', (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send('Falta el ID');

    const pythonProcess = spawn('python3', ['downloadMP3.py', videoId]);

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python log: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error Detalle: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Proceso de Python finalizado con código: ${code}`);
        if (code === 0) {
            const fileName = `${videoId}.mp3`;
            const filePath = path.resolve(fileName);

            if (fs.existsSync(filePath)) {
                res.download(filePath, `audio_${videoId}.mp3`, (err) => {
                    if (err) console.error("Error al enviar archivo:", err);
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                });
            } else {
                res.status(500).send("Archivo MP3 no encontrado en el servidor");
            }
        } else {
            res.status(500).send(`Error en Python. Revisa la consola del servidor.`);
        }
    });
});

export default router;