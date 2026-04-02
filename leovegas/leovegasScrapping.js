import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

export async function scrapeLeoVegasFootball(browserParam) {
    const ngrokAddr = '5.tcp.eu.ngrok.io:19911'; 
    const publicDir = path.join(process.cwd(), 'public');
    
    const browser = browserParam || await puppeteer.launch({
        headless: 'new', 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            '--no-zygote',
            '--single-process',
            '--window-size=1920,1080',
            '--disable-http2',
            '--disable-connection-pool',
            '--blink-settings=imagesEnabled=false',
            `--proxy-server=http://${ngrokAddr}`
        ]
    });

    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        console.log('🌐 [LEOVEGAS] Navegando...');
        await page.goto('https://www.leovegas.es/apuestas-deportivas#all-sports', {
            waitUntil: 'domcontentloaded', 
            timeout: 60000
        });

        console.log('⏳ [LEOVEGAS] Pausa técnica de 15s para carga de scripts...');
        await new Promise(r => setTimeout(r, 15000)); 

        // --- CAPTURA 1: Ver si hay cookies o si la página está bloqueada ---
        const htmlCookies = await page.content();
        //fs.writeFileSync(path.join(publicDir, 'debug_leovegas_cookies.html'), htmlCookies);

        console.log('🍪 [LEOVEGAS] Gestionando cookies...');
        try {
            const acceptSelector = 'button[data-testid="accept-button"]';
            await page.waitForSelector(acceptSelector, { timeout: 10000, visible: true });
            await page.click(acceptSelector);
            console.log('✅ Cookies aceptadas.');
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) { console.log('ℹ️ Banner de cookies no detectado.'); }

        console.log('⏳ [LEOVEGAS] Aplicando filtro 24h...');
        try {
            await page.evaluate(() => {
                const botones = Array.from(document.querySelectorAll('button'));
                const btn = botones.find(b => b.innerText.includes('Próximas 24h'));
                if (btn) btn.click();
            });
            await new Promise(r => setTimeout(r, 8000));
        } catch (e) { console.log('⚠️ No se pudo aplicar filtro 24h.'); }

        // --- CAPTURA 2: Rayos X del Sportsbook ---
        console.log('💾 [LEOVEGAS] Guardando HTML final para análisis...');
        const htmlFinal = await page.content();
        fs.writeFileSync(path.join(publicDir, 'debug_leovegas_real.html'), htmlFinal);
        await page.screenshot({ path: path.join(publicDir, 'debug_leovegas.png'), fullPage: true });

        const mapaResultados = {};
        // Selector genérico para las ligas de Kambi
        const selectorHeader = '[class*="headerContainer"], [data-testid="collapsible-container"], .KambiBC-collapsible-header';

        console.log('📊 [LEOVEGAS] Intentando extraer eventos...');
        
        // No lanzamos error aquí para que el flujo siga, pero informamos
        const headersExist = await page.$(selectorHeader);
        if (!headersExist) {
            console.log('❌ [LEOVEGAS] No se encontraron las cabeceras de liga con los selectores actuales.');
            return {};
        }

        const numHeaders = await page.$$eval(selectorHeader, els => els.length);
        console.log(`📂 [LEOVEGAS] ${numHeaders} secciones encontradas.`);

        for (let i = 0; i < numHeaders; i++) {
            try {
                const headers = await page.$$(selectorHeader);
                const currentHeader = headers[i];

                const nombreLiga = await page.evaluate(el => el.innerText.split('\n')[0].trim(), currentHeader);
                if (nombreLiga.toUpperCase().includes('VIVO') || !nombreLiga) continue;

                await currentHeader.scrollIntoView();
                await page.evaluate(el => el.click(), currentHeader);
                await new Promise(r => setTimeout(r, 1500));

                const partidos = await page.evaluate((ligaNombre) => {
                    const cards = Array.from(document.querySelectorAll('[class*="eventCard"], [data-testid="event-card"]'));
                    return cards.map(card => {
                        const home = card.querySelector('[data-testid="homeName"]')?.innerText.trim();
                        const away = card.querySelector('[data-testid="awayName"]')?.innerText.trim();
                        const cuotasEls = Array.from(card.querySelectorAll('[class*="outcome-value"], [class*="label-3"]'));
                        const cuotas = cuotasEls.slice(0, 3).map(c => parseFloat(c.innerText.replace(',', '.')));
                        const hora = card.querySelector('[data-testid="clock"]')?.innerText.trim() || "00:00";

                        if (home && away && cuotas.length >= 3) {
                            return { home, away, hora, cuotas, liga: ligaNombre };
                        }
                        return null;
                    }).filter(p => p !== null);
                }, nombreLiga);

                partidos.forEach(p => {
                    const key = generarIdUnico(p.home, p.away, p.hora);
                    mapaResultados[key] = {
                        partido: `${p.home} vs ${p.away}`,
                        cuotas: p.cuotas,
                        competicion: p.competicion,
                        hora: p.hora,
                        casa: 'LeoVegas'
                    };
                });
            } catch (err) { }
        }

        return mapaResultados;

    } catch (e) {
        console.error("❌ [LEOVEGAS] Fallo:", e.message);
        return {};
    } finally {
        await page.close();
        if (!browserParam) await browser.close();
    }
}