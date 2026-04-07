import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';

puppeteer.use(StealthPlugin());

export async function scrapeWinamaxIceHockey(browserParam) {
    const browser = browserParam || await puppeteer.launch({
        headless: true,
        protocolTimeout: 240000, 
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', 
        args: [
            '--no-sandbox',
            '--window-size=1920,1080',
            '--disable-dev-shm-usage'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        console.log('🌐 [WINAMAX] Navegando a fútbol (Solo Pre-partido)...');
        await page.goto('https://www.winamax.es/apuestas-deportivas/sports/4', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // GESTIÓN DE COOKIES
        try {
            await page.waitForSelector('#tarteaucitronRoot', { timeout: 5000 });
            await page.click('#tarteaucitronAllAllowed');
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {}

        let todosLosPartidos = new Map(); 
        let scrollFinalizado = false;
        let lastHeight = await page.evaluate(() => document.body.scrollHeight);
        let intentosSinCambios = 0;

        while (!scrollFinalizado) {
            const extraccion = await page.evaluate(() => {
                const results = [];
                let detenerScroll = false;
                const cards = document.querySelectorAll('div[data-testid^="match-card-"]');
                
                for (const card of cards) {
                    const textoTarjeta = card.innerText || '';
                    
                    // Si llegamos a "Mañana" o días de la semana, dejamos de scrollear
                    if (textoTarjeta.includes('Mañana') || textoTarjeta.match(/(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)/i)) {
                        detenerScroll = true;
                        break; 
                    }

                    // FILTRO CRÍTICO: Si existe el indicador de "Live", ignoramos este partido
                    const isLive = card.querySelector('[data-testid="live-indicator"]') !== null;
                    if (isLive) continue; 

                    const id = card.getAttribute('data-testid');
                    const infoHeader = card.querySelector('.sc-gZGiDA');
                    const liga = infoHeader ? infoHeader.innerText.trim().replace(/\n/g, ' ') : 'N/A';
                    
                    const equipos = Array.from(card.querySelectorAll('.sc-dMOLTJ'))
                                         .map(el => el.innerText.trim());
                    
                    const cuotas = Array.from(card.querySelectorAll('.odd-button-value'))
                                        .map(el => el.innerText.trim());

                    // Capturamos la hora de inicio (HH:mm)
                    const horaMatch = textoTarjeta.match(/([0-9]{1,2}:[0-9]{2})/);
                    const hora = horaMatch ? horaMatch[1] : 'N/A';

                    if (equipos.length >= 2 && hora !== 'N/A') {
                        results.push({ 
                            id, 
                            hora,
                            liga, 
                            local: equipos[0], 
                            visitante: equipos[1], 
                            cuota_1: cuotas[0] || '0', 
                            cuota_X: cuotas[1] || '0', 
                            cuota_2: cuotas[2] || '0' 
                        });
                    }
                }
                
                return { partidos: results, detenerScroll };
            });

            // Guardar en el Map para evitar duplicados por ID de tarjeta
            extraccion.partidos.forEach(p => {
                if (!todosLosPartidos.has(p.id)) {
                    todosLosPartidos.set(p.id, p);
                }
            });

            if (extraccion.detenerScroll) {
                scrollFinalizado = true;
                break; 
            }

            await page.mouse.wheel({ deltaY: 900 });
            await new Promise(r => setTimeout(r, 1200)); 

            const currentHeight = await page.evaluate(() => {
                window.scrollBy(0, 900);
                return document.body.scrollHeight;
            });

            if (currentHeight === lastHeight) {
                intentosSinCambios++;
                if (intentosSinCambios >= 3) scrollFinalizado = true;
            } else {
                intentosSinCambios = 0;
            }
            lastHeight = currentHeight;
        }

        const mapaResultados = {};
        
        Array.from(todosLosPartidos.values()).forEach(p => {
            const cuotasNumericas = [
                parseFloat(p.cuota_1.replace(',', '.')) || 0,
                parseFloat(p.cuota_X.replace(',', '.')) || 0,
                parseFloat(p.cuota_2.replace(',', '.')) || 0
            ];

            // Solo generamos el ID si las cuotas son válidas (mayores a 1)
            if (cuotasNumericas[0] > 1) {
                const key = generarIdUnico(p.local, p.visitante, p.hora);
                mapaResultados[key] = {
                    partido: `${p.local} vs ${p.visitante}`,
                    cuotas: cuotasNumericas,
                    competicion: p.liga,
                    hora: p.hora,
                    casa: 'Winamax'
                };
            }
        });

        console.log(`✅ [WINAMAX] ${Object.keys(mapaResultados).length} partidos pre-partido obtenidos.`);
        return mapaResultados;

    } catch (err) {
        console.error(`❌ [WINAMAX] Error:`, err.message);
        return {};
    } finally {
        await page.close();
        if (!browserParam) await browser.close();
    }
}