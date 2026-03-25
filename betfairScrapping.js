import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { PORT } from './config.js';
const app = express();

    
app.use(express.json());

const startScrapping = () => {
    console.log('holb')
}

app.listen(PORT, () => {
    console.log(`🚀 Server running en: `, PORT);

    startScrapping()
});