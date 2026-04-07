import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';

puppeteer.use(StealthPlugin());

export async function scrapeBetfairIceHockey() {
    const url = 'https://www.betfair.es/sport/ice-hockey';
    const mapaResultados = {};

   const browser = await puppeteer.launch({
        headless: "new",
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
            '--disable-extensions',         
            '--disable-component-update',  
            '--no-default-browser-check',
        ]
    });

    const page = await browser.newPage();

    // Bypass de advertencias de túnel
    await page.setExtraHTTPHeaders({
        'ngrok-skip-browser-warning': 'true',
        'Bypass-Tunnel-Reminder': 'true'
    });

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log('🌐 [BETFAIR] Navegando a la web...');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // 1. CERRAR COOKIES (Lo que faltaba)
        console.log('🍪 [BETFAIR] Gestionando cookies...');
        try {
            const cookieBtn = '#onetrust-accept-btn-handler';
            await page.waitForSelector(cookieBtn, { timeout: 10000 });
            await page.click(cookieBtn);
            console.log('✅ [BETFAIR] Cookies aceptadas.');
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.log('ℹ️ [BETFAIR] No se detectó banner de cookies.');
        }
        // 2. EXTRAER PARTIDOS (Basado en el HTML que me pasaste)
        console.log('📊 [BETFAIR] Extrayendo eventos...');
        const partidosData = await page.evaluate(() => {
            const lista = [];
            // Buscamos todas las secciones (En Juego, Hoy, Mañana...)
            const secciones = document.querySelectorAll('li.section');

            secciones.forEach(seccion => {
               const tituloSeccion = seccion.querySelector('.section-header-title')?.innerText.trim() || "";

                // Pasamos a minúsculas para asegurar que lo pilla siempre, sin importar cómo lo escriba Betfair
                if (tituloSeccion.toLowerCase() === 'en juego') {
                    return; // Salta al siguiente elemento del forEach
                }

                const filas = seccion.querySelectorAll('.com-coupon-line-new-layout');

                filas.forEach(row => {
                    const teams = row.querySelectorAll('.team-name');
                    if (teams.length < 2) return;

                    const home = teams[0].innerText.trim();
                    const away = teams[1].innerText.trim();
                    
                    // Betfair separa las cuotas 1X2 en .market-3-runners
                    const market1X2 = row.querySelector('.market-3-runners');
                    if (!market1X2) return;

                    const botones = market1X2.querySelectorAll('.ui-display-decimal-price');
                    
                    if (botones.length >= 3) {
                        const cuotas = [
                            parseFloat(botones[0].innerText.trim().replace(',', '.')),
                            parseFloat(botones[1].innerText.trim().replace(',', '.')),
                            parseFloat(botones[2].innerText.trim().replace(',', '.'))
                        ];

                        let hora = row.querySelector('.date')?.innerText.trim() || 
                                     row.querySelector('.event-inplay-state')?.innerText.trim() || "00:00";
                                     
                        if (hora.includes('Comienza en')) {
                            const match = hora.match(/Comienza en (\d+)/); 
                            
                            if (match && match[1]) { 
                                const minutosASumar = parseInt(match[1], 10);
                                const ahora = new Date(); 
                                ahora.setMinutes(ahora.getMinutes() + minutosASumar);
                                const horasTexto = String(ahora.getHours()).padStart(2, '0');
                                const minutosTexto = String(ahora.getMinutes()).padStart(2, '0');
                                hora = `${horasTexto}:${minutosTexto}`;
                            }
                        }

                        const liga = row.querySelector('.event-link')?.getAttribute('data-competition') || "Fútbol";

                        if (!isNaN(cuotas[0]) && home && away) {
                            lista.push({ home, away, cuotas, hora, liga });
                        }
                    }
                });
            });
            return lista;
        });

        // 3. UNIFICAR EN TU MAPA
        partidosData.forEach((p, i) => {
            try {
                const key = generarIdUnico(p.home, p.away, p.hora);
                mapaResultados[key] = {
                    eventId: `${i}_BF_${p.home.substring(0,3).toUpperCase()}`,
                    partido: `${p.home} vs ${p.away}`,
                    cuotas: p.cuotas,
                    competicion: p.liga,
                    hora: p.hora,
                    casa: 'Betfair'
                };
            } catch (err) {}
        });

        console.log(`✅ [BETFAIR] Éxito: ${Object.keys(mapaResultados).length} partidos encontrados.`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ [BETFAIR] Error crítico:', error.message);
        return {};
    } finally {
        console.log('🚪 [BETFAIR] Cerrando navegador...');
        await browser.close();
    }
}