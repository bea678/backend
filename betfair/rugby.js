import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';

puppeteer.use(StealthPlugin());

export async function scrapeBetfairRugby() {
    const url = 'https://www.betfair.es/sport/rugby-union';
    const mapaResultados = {};

    const browser = await puppeteer.launch({
        headless: "true",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080',
            '--disable-http2',              
            '--disable-connection-pool',    
            '--disable-extensions',         
            '--disable-component-update',   
            '--no-default-browser-check',
        ]
    });

    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
        'ngrok-skip-browser-warning': 'true',
        'Bypass-Tunnel-Reminder': 'true'
    });

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log('🏀 [BETFAIR RUGBY] Navegando a la web...');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('🍪 [BETFAIR RUGBY] Gestionando cookies...');
        try {
            const cookieBtn = '#onetrust-accept-btn-handler';
            await page.waitForSelector(cookieBtn, { timeout: 10000 });
            await page.click(cookieBtn);
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {}

        console.log('📊 [BETFAIR RUGBY] Extrayendo eventos...');
        const partidosData = await page.evaluate(() => {
            const lista = [];
            const secciones = document.querySelectorAll('li.section');

            // Usamos un bucle tradicional para poder usar "break" y detener la extracción
            for (const seccion of secciones) {
                const tituloSeccion = seccion.querySelector('.section-header-title')?.innerText.trim() || "";

                if (tituloSeccion.toLowerCase() === 'en juego') continue;

                const filas = seccion.querySelectorAll('.com-coupon-line-new-layout');

                for (const row of filas) {
                    let horaRaw = row.querySelector('.date')?.innerText.trim() || 
                                  row.querySelector('.event-inplay-state')?.innerText.trim() || "";

                    // --- CONDICIÓN DE PARADA: Si detectamos "mañana", dejamos de procesar ---
                    if (horaRaw.toLowerCase().includes('mañana')) {
                        return lista; // Retorna lo acumulado hasta ahora y sale del evaluate
                    }

                    const teams = row.querySelectorAll('.team-name');
                    if (teams.length < 2) continue;

                    const home = teams[0].innerText.trim();
                    const away = teams[1].innerText.trim();
                    
                    const market2Runners = row.querySelector('.market-2-runners');
                    if (!market2Runners) continue;

                    const botones = market2Runners.querySelectorAll('.ui-display-decimal-price');
                    
                    if (botones.length >= 2) {
                        const cuotas = [
                            parseFloat(botones[0].innerText.trim().replace(',', '.')),
                            parseFloat(botones[1].innerText.trim().replace(',', '.'))
                        ];

                        // Normalización de "Comienza en X min"
                        let horaFinal = horaRaw;
                        if (horaRaw.includes('Comienza en')) {
                            const match = horaRaw.match(/Comienza en (\d+)/); 
                            if (match && match[1]) { 
                                const minutosASumar = parseInt(match[1], 10);
                                const ahora = new Date(); 
                                ahora.setMinutes(ahora.getMinutes() + minutosASumar);
                                horaFinal = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
                            }
                        }

                        const liga = row.querySelector('.event-link')?.getAttribute('data-competition') || "RUGBY";

                        if (!isNaN(cuotas[0]) && home && away) {
                            lista.push({ home, away, cuotas, hora: horaFinal, liga });
                        }
                    }
                }
            }
            return lista;
        });

        // UNIFICAR EN MAPA
        partidosData.forEach((p, i) => {
            try {
                const key = generarIdUnico(p.home, p.away, p.hora);
                mapaResultados[key] = {
                    eventId: `${i}_BFB_${p.home.substring(0,3).toUpperCase()}`,
                    partido: `${p.home} vs ${p.away}`,
                    cuotas: p.cuotas,
                    competicion: p.liga,
                    hora: p.hora,
                    casa: 'Betfair'
                };
            } catch (err) {}
        });

        console.log(`✅ [BETFAIR RUGBY] Éxito: ${Object.keys(mapaResultados).length} partidos encontrados (Hoy).`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ [BETFAIR RUGBY] Error:', error.message);
        return {};
    } finally {
        await browser.close();
    }
}