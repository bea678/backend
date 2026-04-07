import 'dotenv/config';
import puppeteer from 'puppeteer';
import { generarIdUnico } from '../bearbitrage/scrape.js';

export async function scrapeTonybetBasketball() {
    // CAMBIO 1: URL de Baloncesto
    const url = 'https://tonybet.es/prematch/basketball';
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const mapaResultados = {};

    console.log('🏀 Iniciando scraper de Baloncesto...');
    const browser = await puppeteer.launch({
        headless: 'true',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--window-size=1920,15000',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 15000 });

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        console.log(`📡 Navegando a: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        await delay(5000); 

        const cookieBtn = '#onetrust-accept-btn-handler';
        try {
            await page.waitForSelector(cookieBtn, { timeout: 5000 });
            await page.click(cookieBtn);
            console.log('✅ Cookies aceptadas.');
        } catch (e) {
            console.log('ℹ️ No se detectó banner de cookies.');
        }

        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 1000; 
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 400);
            });
        });

        await delay(3000);

        console.log('📊 Extrayendo datos de Basket...');
        const partidos = await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-test="eventTableRow"]');
            const lista = [];

            rows.forEach(fila => {
                const teams = fila.querySelectorAll('[data-test="teamName"] span');
                if (teams.length < 2) return;
                
                const timeEl = fila.querySelector('[data-test="eventTime"]');
                const dateEl = fila.querySelector('[data-test="eventDate"]');
                const ligaEl = fila.querySelector('[data-test="leagueLink"]');

                const t1 = teams[0].innerText.trim();
                const t2 = teams[1].innerText.trim();
                const horaText = timeEl ? timeEl.innerText.trim() : '00:00';
                const fechaText = dateEl ? dateEl.innerText.trim() : '';
                const ligaText = ligaEl ? ligaEl.innerText.trim() : 'Basket';


                const [day, month, year] = fechaText.split('.').map(Number);
                const fechaInput = new Date(year, month - 1, day);
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                fechaInput.setHours(0, 0, 0, 0);
                const isToday = fechaInput.getTime() === hoy.getTime();

                if (!isToday) return;

                const cuotasNodes = fila.querySelectorAll('[data-test="outcome"]');
                
                const cuotasValores = Array.from(cuotasNodes)
                    .map(n => parseFloat(n.innerText.trim().replace(',', '.')))
                    .filter(n => !isNaN(n));

                if (cuotasValores.length >= 2) {
                    lista.push({
                        t1, t2, 
                        fechaText, 
                        horaText, 
                        cuotas: [cuotasValores[0], cuotasValores[1]], // Solo 2 cuotas en Basket
                        ligaText 
                    });
                }
            });
            return lista;
        });

        partidos.forEach((p, i) => {
            const key = generarIdUnico(p.t1, p.t2, p.horaText);
            mapaResultados[key] = {
                eventId: `BASKET_${i}`,
                partido: `${p.t1} vs ${p.t2}`,
                cuotas: p.cuotas,
                competicion: p.ligaText,
                hora: p.horaText,
                fecha: p.fechaText
            };
        });

        console.log(`✅ Éxito: ${Object.keys(mapaResultados).length} partidos de baloncesto encontrados.`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ Error en Basket:', error.message);
        return {};
    } finally {
        await browser.close();
    }
}
