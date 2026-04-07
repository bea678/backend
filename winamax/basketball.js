import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';

puppeteer.use(StealthPlugin());

export async function scrapeWinamaxBasketball(browserParam) {
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
        console.log('🏀 [WINAMAX] Navegando a la sección de baloncesto...');
        // Cambio de URL a sports/2 (Baloncesto)
        await page.goto('https://www.winamax.es/apuestas-deportivas/sports/2', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // 1. GESTIÓN DE BLOQUEOS
        try {
            await page.waitForSelector('#tarteaucitronRoot', { timeout: 5000 });
            await page.click('#tarteaucitronAllAllowed');
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {}

        try {
            const closeBtn = 'div[role="button"][aria-label="Cerrar"]';
            await page.waitForSelector(closeBtn, { timeout: 3000 });
            await page.click(closeBtn);
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
                    
                    if (textoTarjeta.includes('Mañana') || textoTarjeta.match(/(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)/i)) {
                        detenerScroll = true;
                        break; 
                    }

                    const id = card.getAttribute('data-testid');
                    const infoHeader = card.querySelector('.sc-gZGiDA');
                    const liga = infoHeader ? infoHeader.innerText.trim().replace(/\n/g, ' ') : 'N/A';
                    
                    const equipos = Array.from(card.querySelectorAll('.sc-dMOLTJ'))
                                         .map(el => el.innerText.trim());
                    
                    const cuotas = Array.from(card.querySelectorAll('.odd-button-value'))
                                        .map(el => el.innerText.trim());

                    const horaMatch = textoTarjeta.match(/([0-9]{1,2}:[0-9]{2})/);
                    const hora = horaMatch ? horaMatch[1] : 'En vivo';

                    if (equipos.length >= 2) {
                        // Lógica adaptada para baloncesto: suele haber 2 cuotas (1 y 2).
                        // Si excepcionalmente hay 3 (1X2), asignamos la del medio al empate.
                        let c1 = cuotas[0] || '0';
                        let cX = cuotas.length === 3 ? cuotas[1] : '0';
                        let c2 = cuotas.length === 3 ? cuotas[2] : (cuotas[1] || '0');

                        results.push({ 
                            id, 
                            hora,
                            liga, 
                            local: equipos[0], 
                            visitante: equipos[1], 
                            cuota_1: c1, 
                            cuota_X: cX, 
                            cuota_2: c2 
                        });
                    }
                }
                
                return { partidos: results, detenerScroll };
            });

            // Procesar partidos
            let nuevosEnEstaVuelta = 0;
            extraccion.partidos.forEach(p => {
                if (!todosLosPartidos.has(p.id)) {
                    todosLosPartidos.set(p.id, p);
                    nuevosEnEstaVuelta++;
                }
            });

            if (extraccion.detenerScroll) {
                console.log('🛑 [WINAMAX] Se ha detectado la etiqueta "Mañana". Cortando el scroll...');
                scrollFinalizado = true;
                break; 
            }

            // Realizar scroll
            await page.mouse.wheel({ deltaY: 900 });
            await new Promise(r => setTimeout(r, 1500)); 

            const currentHeight = await page.evaluate(() => {
                window.scrollBy(0, 900);
                return document.body.scrollHeight;
            });

            if (currentHeight === lastHeight) {
                intentosSinCambios++;
                if (intentosSinCambios >= 4) scrollFinalizado = true;
            } else {
                intentosSinCambios = 0;
            }
            lastHeight = currentHeight;
        }

        const mapaResultados = {};
        
        Array.from(todosLosPartidos.values()).forEach(p => {
            const cuota1Num = parseFloat(p.cuota_1.replace(',', '.')) || 0;
            const cuotaXNum = parseFloat(p.cuota_X.replace(',', '.')) || 0;
            const cuota2Num = parseFloat(p.cuota_2.replace(',', '.')) || 0;

            // Formato de salida: Si no hay cuota de empate (como es habitual en basket), 
            // devolvemos un array de 2 elementos para mantener el JSON limpio para surebets.
            const cuotasNumericas = p.cuota_X === '0' ? [cuota1Num, cuota2Num] : [cuota1Num, cuotaXNum, cuota2Num];

            const key = generarIdUnico(p.local, p.visitante, p.hora);
            
            mapaResultados[key] = {
                partido: `${p.local} vs ${p.visitante}`,
                cuotas: cuotasNumericas,
                competicion: p.liga,
                hora: p.hora,
                casa: 'Winamax'
            };
        });

        console.log(`✅ [WINAMAX] Se han obtenido ${Object.keys(mapaResultados).length} partidos de baloncesto.`);
        return mapaResultados;

    } catch (err) {
        console.error(`❌ [WINAMAX] Error durante el scraping de baloncesto:`, err.message);
        return {};
    } finally {
        await page.close();
        if (!browserParam) await browser.close();
    }
}
