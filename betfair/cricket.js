import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';

puppeteer.use(StealthPlugin());

export async function scrapeBetfairCriquet() {
    const url = 'https://www.betfair.es/sport/cricket';
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

        console.log('🎾 [BETFAIR CRICKET] Navegando a la web...');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('🍪 [BETFAIR CRICKET] Gestionando cookies...');
        try {
            const cookieBtn = '#onetrust-accept-btn-handler';
            await page.waitForSelector(cookieBtn, { timeout: 10000 });
            await page.click(cookieBtn);
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            // Ignorar si no hay cookies
        }

        console.log('📊 [BETFAIR CRICKET] Extrayendo eventos...');
        const partidosData = await page.evaluate(() => {
            const lista = [];
            const secciones = document.querySelectorAll('li.section');

            for (const seccion of secciones) {
                const tituloSeccion = seccion.querySelector('.section-header-title')?.textContent.trim() || "";

                if (tituloSeccion.toLowerCase() === 'en juego') continue;

                const filas = seccion.querySelectorAll('.com-coupon-line-new-layout');

                for (const row of filas) {
                    let horaElem = row.querySelector('.date') || row.querySelector('.event-inplay-state');
                    let horaRaw = horaElem ? horaElem.textContent.replace(/\s+/g, ' ').trim() : "";
                    
                    if (horaRaw.includes('A punto de empezar')) continue;

                    if (horaRaw.toLowerCase().includes('mañana')) {
                        return lista; 
                    }

                    const teams = row.querySelectorAll('.team-name');
                    if (teams.length < 2) continue;

                    // Limpieza total de viñetas y espacios dobles/saltos de línea
                    const home = teams[0].textContent.replace(/•/g, '').replace(/\s+/g, ' ').trim();
                    const away = teams[1].textContent.replace(/•/g, '').replace(/\s+/g, ' ').trim();
                    
                    const market2Runners = row.querySelector('.market-2-runners');
                    if (!market2Runners) continue;

                    const selecciones = market2Runners.querySelectorAll('li.selection');
                    if (selecciones.length >= 2) {
                        
                        const cuota1Elem = selecciones[0].querySelector('.ui-display-decimal-price') || selecciones[0].querySelector('.ui-runner-price');
                        const cuota2Elem = selecciones[1].querySelector('.ui-display-decimal-price') || selecciones[1].querySelector('.ui-runner-price');

                        if (cuota1Elem && cuota2Elem) {
                            // Extrae estrictamente solo los números y formatea el punto decimal
                            const textoCuota1 = cuota1Elem.textContent.replace(/[^\d.,]/g, '').replace(',', '.');
                            const textoCuota2 = cuota2Elem.textContent.replace(/[^\d.,]/g, '').replace(',', '.');

                            const cuotas = [
                                parseFloat(textoCuota1),
                                parseFloat(textoCuota2)
                            ];

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

                            const liga = row.querySelector('.event-link')?.getAttribute('data-competition') || "CRICKET";

                            if (!isNaN(cuotas[0]) && !isNaN(cuotas[1]) && home && away) {
                                lista.push({ home, away, cuotas, hora: horaFinal, liga });
                            }
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
                    eventId: `${i}_BFT_${p.home.substring(0,3).toUpperCase()}`,
                    partido: `${p.home} vs ${p.away}`,
                    cuotas: p.cuotas,
                    competicion: p.liga,
                    hora: p.hora,
                    casa: 'Betfair'
                };
            } catch (err) {}
        });

        console.log(`✅ [BETFAIR CRICKET] Éxito: ${Object.keys(mapaResultados).length} partidos encontrados (Hoy).`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ [BETFAIR CRICKET] Error:', error.message);
        return {};
    } finally {
        await browser.close();
    }
}