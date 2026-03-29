import 'dotenv/config';
import puppeteer from 'puppeteer';
import { generarIdUnico } from './scrapeArbitrage.js';

export async function scrapeLeoVegasFootball() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--window-size=1920,1080']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        console.log('🌐 Navegando a LeoVegas...');
        await page.goto('https://www.leovegas.es/apuestas-deportivas#all-sports', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('⏳ Cambiando a Próximas 24h...');
        await page.waitForSelector('[data-testid="togglebutton-container"]', { timeout: 15000 });
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Próximas 24h'));
            if (btn) btn.click();
        });

        console.log('Line 29');
        await new Promise(r => setTimeout(r, 4000));

        const headers = await page.$$('.headerContainer__alxl3');
        const mapaResultados = {};

        for (let i = 0; i < headers.length; i++) {
            const nombreLiga = await page.evaluate(el => el.querySelector('.title__Doa6k')?.innerText.trim() || "Liga", headers[i]);
            
            await headers[i].scrollIntoView();
            await page.evaluate(el => el.click(), headers[i]);
            await new Promise(r => setTimeout(r, 1000));

            const partidos = await page.evaluate((idx, liga) => {
                const container = document.querySelectorAll('.accordionContainer__nKzkO')[idx];
                if (!container || container.innerText.includes('AHORA EN VIVO')) return [];

                return Array.from(container.querySelectorAll('[class*="eventCard__cfvtT"]')).map(tarjeta => {
                    const clock = tarjeta.querySelector('[data-testid="clock"]')?.innerText.trim() || "00:00";
                    const home = tarjeta.querySelector('[data-testid="homeName"]')?.innerText.trim();
                    const away = tarjeta.querySelector('[data-testid="awayName"]')?.innerText.trim();
                    const cuotas = Array.from(tarjeta.querySelectorAll('.label-3__PJ0vg')).map(c => parseFloat(c.innerText));

                    if (home && away && cuotas.length >= 3 && !clock.includes("'") && !home.includes('(')) {
                        return { home, away, hora: clock, cuotas, liga };
                    }
                    return null;
                }).filter(p => p !== null);
            }, i, nombreLiga);

            partidos.forEach(p => {
                const key = generarIdUnico(p.home, p.away, p.hora);
                mapaResultados[key] = {
                    eventId: i + "_" + p.home,
                    partido: `${p.home} vs ${p.away}`,
                    cuotas: p.cuotas,
                    competicion: p.liga,
                    hora: p.hora
                };
            });
        }
        
        console.log(`✅ LeoVegas: ${Object.keys(mapaResultados).length} partidos mapeados.`);
        return mapaResultados;

    } catch (e) {
        console.error("❌ Error en LeoVegas:", e.message);
        return {};
    } finally {
        await browser.close();
    }
}