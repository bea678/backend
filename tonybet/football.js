import 'dotenv/config';
import puppeteer from 'puppeteer';
import { generarIdUnico } from '../bearbitrage/scrape.js';

export async function scrapeTonyBetFootball() {
    const url = 'https://tonybet.es/prematch/football';
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const mapaResultados = {};

    console.log('🚀 Iniciando navegador en modo oculto...');
    const browser = await puppeteer.launch({
        headless: 'true', 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--window-size=1920,15000', // <-- Tamaño exacto que has pedido
            '--disable-blink-features=AutomationControlled' // Oculta rastro de bot
        ]
    });

    const page = await browser.newPage();

    page.on('console', msg => {
        const texto = msg.text();
        if (texto.startsWith('MIO:')) {
            console.log('✅ DEBUG:', texto.replace('MIO:', ''));
        }
    });

    // Fijamos el viewport interno a 15000px de alto
    await page.setViewport({ width: 1920, height: 15000 });

    try {
        // Disfrazamos el User-Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Borramos la propiedad webdriver que chiva que somos Puppeteer
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        console.log(`📡 Navegando a: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        await delay(4000); 

        console.log('🍪 Buscando banner de cookies...');
        const cookieBtn = '#onetrust-accept-btn-handler';
        const banner = await page.waitForSelector(cookieBtn, { timeout: 8000, visible: true }).catch(() => null);

        if (banner) {
            await page.evaluate((selector) => {
                const btn = document.querySelector(selector);
                if (btn) btn.click();
            }, cookieBtn);
            console.log('✅ Cookies cerradas.');
            await delay(2000);
        }
        
        console.log('⏳ Iniciando auto-scroll progresivo para forzar carga...');
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                // Como tienes 15000px de pantalla, hacemos saltos más grandes
                const distance = 800; 
                let scrolls = 0;
                const maxScrolls = 60; 
                
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    scrolls++;

                    if (totalHeight >= scrollHeight - window.innerHeight || scrolls >= maxScrolls) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 300); 
            });
        });

        console.log('✅ Scroll finalizado. Esperando 5s para inyección de eventos finales...');
        await delay(5000); 

        console.log('📊 Extrayendo datos...');
        const partidos = await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-test="eventTableRow"]');
            const lista = [];

            rows.forEach(fila => {
                const teams = fila.querySelectorAll('[data-test="teamName"] span');
                if (teams.length < 2) return;
                
                const dateEl = fila.querySelector('[data-test="eventDate"]');
                const timeEl = fila.querySelector('[data-test="eventTime"]');
                const ligaEl = fila.querySelector('[data-test="leagueLink"]');

                const fechaText = dateEl ? dateEl.innerText.trim() : 'FECHA NO ENCONTRADA';
                const horaText = timeEl ? timeEl.innerText.trim() : 'HORA NO ENCONTRADA';
                const ligaText = ligaEl ? ligaEl.innerText.trim() : 'LIGA NO ENCONTRADA';

                const t1 = teams[0].innerText.trim();
                const t2 = teams[1].innerText.trim();
                
                if (!t1 || t1 === "") return;

                const bloque1X2 = fila.querySelector('.SZxOo');
                if (bloque1X2) {
                    const cuotasNodes = bloque1X2.querySelectorAll('[data-test="outcome"]');
                    const cuotas = Array.from(cuotasNodes)
                                        .map(nodo => parseFloat(nodo.innerText.trim().replace(',', '.')))
                                        .slice(0, 3);

                    if (cuotas.length >= 2 && !isNaN(cuotas[0])) {
                        lista.push({ t1, t2, fechaText, horaText, cuotas, ligaText });
                    }
                }
            });
            return lista;
        });

        partidos.forEach((p, i) => {
            const key = generarIdUnico(p.t1, p.t2, p.horaText);
            mapaResultados[key] = {
                eventId: `${i}_${p.t1.substring(0,3).toUpperCase()}`,
                partido: `${p.t1} vs ${p.t2}`,
                cuotas: p.cuotas,
                competicion: p.ligaText,
                hora: p.horaText,
                fecha: p.fechaText
            };
        });

        console.log('\n--- RESULTADOS 1 X 2 ---');
        console.log(`✅ Éxito final: ${Object.keys(mapaResultados).length} eventos en el mapa.`);
       
        return mapaResultados;

    } catch (error) {
        console.error('❌ Error detectado:', error.message);
        return {};
    } finally {
         await browser.close();
         console.log('🚪 Navegador cerrado.');
    }
}