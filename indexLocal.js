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


app.listen(PORT, () => {
    console.log(`🚀 Server running en:${PORT}`);
});