import 'dotenv/config';
import puppeteer from 'puppeteer';
import { generarIdUnico } from '../bearbitrage/scrape.js';

export async function scrapeTonybetTennis() {
    const url = 'https://tonybet.es/prematch/tennis';
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const mapaResultados = {};

    console.log('🎾 Iniciando scraper de Tenis...');
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
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        await delay(5000); 

        const cookieBtn = '#onetrust-accept-btn-handler';
        try {
            await page.waitForSelector(cookieBtn, { timeout: 5000 });
            await page.click(cookieBtn);
            console.log('✅ Cookies aceptadas.');
        } catch (e) {
            console.log('ℹ️ No se detectó banner de cookies.');
        }

        console.log('⬇️ Forzando carga de todos los elementos...');
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let intentos = 0;
                let timer = setInterval(() => {
                    // Seleccionamos todas las filas de partidos cargadas actualmente
                    const rows = document.querySelectorAll('[data-test="eventTableRow"]');
                    if (rows.length === 0) {
                        intentos++;
                    } else {
                        // Hacemos scroll hasta la ÚLTIMA fila visible
                        const lastRow = rows[rows.length - 1];
                        lastRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        
                        // Guardamos cuántos hay
                        let currentCount = rows.length;
                        
                        // Comprobamos un poco después si han cargado más
                        setTimeout(() => {
                            let newCount = document.querySelectorAll('[data-test="eventTableRow"]').length;
                            if (newCount === currentCount) {
                                intentos++;
                            } else {
                                intentos = 0; // Si cargaron más, reseteamos intentos
                            }
                        }, 500);
                    }

                    // Si tras varios intentos (aprox 3-4 segundos) no hay filas nuevas, terminamos
                    if (intentos >= 6) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 800);
            });
        });

        await delay(3000);

        console.log('📊 Extrayendo datos de Tenis...');
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
                const ligaText = ligaEl ? ligaEl.innerText.trim() : 'Tenis';

                // Lógica de filtrado para coger solo los de "hoy"
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
                        cuotas: [cuotasValores[0], cuotasValores[1]], // Solo las 2 cuotas de ganador
                        ligaText 
                    });
                }
            });
            return lista;
        });

        partidos.forEach((p, i) => {
            const key = generarIdUnico(p.t1, p.t2, p.horaText);
            mapaResultados[key] = {
                eventId: `TENIS_${i}`,
                partido: `${p.t1} vs ${p.t2}`,
                cuotas: p.cuotas,
                competicion: p.ligaText,
                hora: p.horaText,
                fecha: p.fechaText
            };
        });

        console.log(`✅ Éxito: ${Object.keys(mapaResultados).length} partidos de Tenis encontrados.`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ Error en Tenis:', error.message);
        return {};
    } finally {
        await browser.close();
    }
}