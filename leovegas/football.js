import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

export async function scrapeLeoVegasFootball(browserParam) {    
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

        const mapaResultados = {};
        const selectorHeader = '[class*="headerContainer"], [data-testid="collapsible-container"], .KambiBC-collapsible-header';

        console.log('📊 [LEOVEGAS] Intentando extraer eventos...');
        
        const headersExist = await page.$(selectorHeader);
        if (!headersExist) {
            console.log('❌ [LEOVEGAS] No se encontraron las cabeceras de liga.');
            return {};
        }

        const numHeaders = await page.$$eval(selectorHeader, els => els.length);
        console.log(`📂 [LEOVEGAS] ${numHeaders} secciones encontradas.`);

        for (let i = 0; i < numHeaders; i++) {
            try {
                if (i % 5 === 0) console.log(`   ⏳ [LEOVEGAS] Procesando liga ${i + 1} de ${numHeaders}...`);

                const headers = await page.$$(selectorHeader);
                const currentHeader = headers[i];
                
                if (!currentHeader) continue;

                const nombreLiga = await page.evaluate(el => el.innerText.split('\n')[0].trim(), currentHeader);
                
                // Saltamos si es "En vivo" o no tiene nombre
                if (!nombreLiga || nombreLiga.toUpperCase().includes('VIVO') || nombreLiga.toUpperCase().includes('LIVE')) {
                    continue;
                }

                await currentHeader.scrollIntoView();
                await page.evaluate(el => el.click(), currentHeader);
                
                // Espera breve para que despliegue el contenido de la liga
                await new Promise(r => setTimeout(r, 600));

                const partidos = await page.evaluate((ligaNombre) => {
                    const cards = Array.from(document.querySelectorAll('[class*="eventCard"], [data-testid="event-card"]'));
                    
                    return cards.map(card => {
                        const home = card.querySelector('[data-testid="homeName"]')?.innerText.trim();
                        const away = card.querySelector('[data-testid="awayName"]')?.innerText.trim();
                        const cuotasEls = Array.from(card.querySelectorAll('[class*="outcome-value"], [class*="label-3"]'));
                        const cuotas = cuotasEls.slice(0, 3).map(c => parseFloat(c.innerText.replace(',', '.')));
                        
                        // --- LÓGICA DE TRATAMIENTO DE HORA ---
                        let horaRaw = card.querySelector('[data-testid="clock"]')?.innerText.trim() || "";
                        let horaFinal = "00:00";

                        if (horaRaw.includes(':')) {
                            // Formato estándar HH:mm
                            horaFinal = horaRaw;
                        } else if (horaRaw.includes("'") || (horaRaw.length > 0 && !isNaN(parseInt(horaRaw)))) {
                            // Formato minutos (ej: "25'"), calculamos hora actual + minutos
                            const minutosASumar = parseInt(horaRaw.replace("'", ""));
                            const ahora = new Date();
                            ahora.setMinutes(ahora.getMinutes() + minutosASumar);
                            
                            const hh = String(ahora.getHours()).padStart(2, '0');
                            const mm = String(ahora.getMinutes()).padStart(2, '0');
                            horaFinal = `${hh}:${mm}`;
                        } else {
                            horaFinal = horaRaw || "00:00";
                        }
                        // -------------------------------------

                        if (home && away && cuotas.length >= 3) {
                            return { home, away, hora: horaFinal, cuotas, liga: ligaNombre };
                        }
                        return null;
                    }).filter(p => p !== null);
                }, nombreLiga);

                partidos.forEach(p => {
                    const key = generarIdUnico(p.home, p.away, p.hora);
                    mapaResultados[key] = {
                        partido: `${p.home} vs ${p.away}`,
                        cuotas: p.cuotas,
                        competicion: p.liga,
                        hora: p.hora,
                        casa: 'LeoVegas'
                    };
                });

                // Opcional: Volver a cerrar el header para no saturar el DOM visualmente
                // await page.evaluate(el => el.click(), currentHeader);

            } catch (err) {
                console.log(`   ⚠️ [LEOVEGAS] Error en sección ${i}:`, err.message);
            }
        }

        console.log(`✅ [LEOVEGAS] Extracción finalizada. Total eventos: ${Object.keys(mapaResultados).length}`);
        return mapaResultados;

    } catch (e) {
        console.error("❌ [LEOVEGAS] Fallo crítico:", e.message);
        return {};
    } finally {
        await page.close();
        if (!browserParam) await browser.close();
    }
}