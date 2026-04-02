import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

/**
 * @param {import('puppeteer').Browser} browserParam 
 */
export async function scrapeTonyBetFootball(browserParam) {
    const ngrokAddr = '5.tcp.eu.ngrok.io:19911'; 
    const url = 'https://tonybet.es/prematch/football';
    const publicDir = path.join(process.cwd(), 'public');
    const mapaResultados = {};

    console.log(`🚀 [TONYBET] Iniciando radar modo "Single-Browser"...`);
    
    // Si no viene del unificador, lanzamos uno (para pruebas sueltas)
    const browser = browserParam || await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process',
            '--window-size=1920,1080',
            '--disable-http2', // HTTP/1.1 es más estable para Ngrok
            '--disable-blink-features=AutomationControlled', // Oculta rastro de bot
            `--proxy-server=http://${ngrokAddr}`
        ]
    });
    
    const page = await browser.newPage();

    try {
        // Bypass de advertencia de Ngrok
        await page.setExtraHTTPHeaders({
            'ngrok-skip-browser-warning': 'true',
            'Bypass-Tunnel-Reminder': 'true'
        });

        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Simulación de humano
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        console.log(`📡 [TONYBET] Navegando a: ${url}`);
        
        // Tonybet necesita networkidle2 porque carga muchísimos scripts de Cloudfront
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
        
        console.log('⏳ [TONYBET] Página base recibida. Forzando hidratación con scroll...');

        // TRUCO: Scroll por pasos para que los scripts de la App se disparen
        for(let i=0; i<4; i++) {
            await page.mouse.wheel({ deltaY: 250 });
            await new Promise(r => setTimeout(r, 1000));
        }

        // ESPERA CRÍTICA: Aguardamos a que los elementos de carga desaparezcan
        console.log('⏳ [TONYBET] Esperando a que el cargador se oculte...');
        try {
            await page.waitForFunction(() => {
                const loader = document.getElementById('app-loader');
                const newLoader = document.getElementById('new_loader');
                const content = document.getElementById('load_content');
                // Retorna TRUE cuando ninguno de los cargadores sea visible o exista
                return (!loader || loader.style.display === 'none') && !newLoader && !content;
            }, { timeout: 40000 });
            console.log('✅ [TONYBET] Cargador desaparecido.');
        } catch (e) {
            console.log('⚠️ [TONYBET] El cargador no se fue a tiempo, intentando extraer igual...');
        }

        // Damos 5 segundos extra para que las cuotas se pinten tras el loader
        await new Promise(r => setTimeout(r, 5000));

        // GUARDAR HTML DE DEBUG
        const html = await page.content();
        fs.writeFileSync(path.join(publicDir, 'debug_tonybet_real.html'), html);
        await page.screenshot({ path: path.join(publicDir, 'debug_tonybet.png') });

        // Gestión de Cookies si aparecen
        try {
            const cookieBtn = '#onetrust-accept-btn-handler';
            if (await page.$(cookieBtn)) {
                await page.click(cookieBtn);
                console.log('✅ [TONYBET] Cookies aceptadas.');
            }
        } catch (e) {}
        
        console.log('📊 [TONYBET] Extrayendo partidos...');
        const partidos = await page.evaluate(() => {
            // Buscamos las filas de la tabla de eventos
            const rows = document.querySelectorAll('[data-test="event-table-row"], [data-test="eventTableRow"], .event-table__row');
            const lista = [];

            rows.forEach(fila => {
                // Buscamos nombres de equipos
                const teams = fila.querySelectorAll('[data-test="team-name"], [data-test="teamName"], .event-team__name');
                if (teams.length < 2) return;
                
                const t1 = teams[0].innerText.trim();
                const t2 = teams[1].innerText.trim();

                // Buscamos las cuotas (usualmente 3 valores para 1X2)
                const cuotasNodes = fila.querySelectorAll('[data-test="outcome-value"], .event-outcome__value, [data-test="outcome"]');
                if (cuotasNodes.length >= 3) {
                    const cuotas = [
                        parseFloat(cuotasNodes[0].innerText.trim().replace(',', '.')),
                        parseFloat(cuotasNodes[1].innerText.trim().replace(',', '.')),
                        parseFloat(cuotasNodes[2].innerText.trim().replace(',', '.'))
                    ];

                    const hora = fila.querySelector('[data-test="event-time"], .event-time, [data-test="eventTime"]')?.innerText.trim() || "00:00";
                    
                    // Si la cuota 1 es un número válido, el partido es bueno
                    if (!isNaN(cuotas[0]) && t1 && t2) {
                        lista.push({ t1, t2, hora, cuotas });
                    }
                }
            });
            return lista;
        });

        partidos.forEach((p, i) => {
            const key = generarIdUnico(p.t1, p.t2, p.hora);
            mapaResultados[key] = {
                partido: `${p.t1} vs ${p.t2}`,
                cuotas: p.cuotas,
                competicion: "Fútbol", // Tonybet a veces no da la liga fácil en la fila
                hora: p.hora,
                casa: 'TonyBet'
            };
        });

        console.log(`✅ [TONYBET] Éxito: ${Object.keys(mapaResultados).length} partidos obtenidos.`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ [TONYBET] Error crítico:', error.message);
        return {};
    } finally {
         console.log('🚪 [TONYBET] Cerrando pestaña TonyBet...');
         await page.close();
         if (!browserParam) await browser.close();
    }
}