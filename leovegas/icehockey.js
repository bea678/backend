import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';

puppeteer.use(StealthPlugin());

export async function scrapeLeoVegasIceHockey(browserParam) {        
    const browser = browserParam || await puppeteer.launch({
        headless: 'true', 
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-gpu',
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
            console.log('✅ [LEOVEGAS] Cookies aceptadas.');
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) { console.log('ℹ️ Banner de cookies no detectado.'); }       

        // 👇 NUEVO BLOQUE: CLIC EN HOCKEY SOBRE HIELO MEDIANTE DROPDOWN 👇
        console.log('🏒 [LEOVEGAS] Buscando la pestaña de Hockey sobre hielo...');
        try {
            // 1. Clic en "Todo" usando el selector infalible data-testid
            const selectorTodo = 'button[data-testid="menuitem-Todo"]';
            await page.waitForSelector(selectorTodo, { timeout: 10000, visible: true });
            await page.click(selectorTodo);
            
            console.log('⏳ [LEOVEGAS] Menú Todo desplegado. Buscando deporte...');
            await new Promise(r => setTimeout(r, 2000)); // Breve pausa para la animación del menú

            // 2. Buscar y clicar "Hockey sobre hielo" en la lista desplegada
            const deporteClicado = await page.evaluate(() => {
                const elementos = Array.from(document.querySelectorAll('span, p, div, button'));
                
                const elementoDeporte = elementos.find(el => 
                    el.textContent && el.textContent.trim().toUpperCase() === 'HOCKEY SOBRE HIELO'
                );
                
                if (elementoDeporte) {
                    const contenedorClicable = elementoDeporte.closest('button') || elementoDeporte.closest('li') || elementoDeporte;
                    contenedorClicable.click();
                    return true;
                }
                return false;
            });

            if (deporteClicado) {
                console.log('✅ [LEOVEGAS] Clic en Hockey sobre hielo realizado con éxito.');
            } else {
                console.log('⚠️ [LEOVEGAS] No se encontró "Hockey sobre hielo" en el menú desplegable.');
            }
            
            console.log('⏳ [LEOVEGAS] Esperando a que se carguen los partidos de hockey...');
            await new Promise(r => setTimeout(r, 5000)); 
        } catch (e) { 
            console.log('⚠️ [LEOVEGAS] Falló la interacción con el menú.', e.message); 
        }
        // 👆 FIN DEL BLOQUE 👆

        
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
        const mapaResultados = {};
        const selectorHeader = '[class*="headerContainer"], [data-testid="collapsible-container"], .KambiBC-collapsible-header';

        console.log('📊 [LEOVEGAS] Intentando extraer eventos...');
        
        const headersExist = await page.$(selectorHeader);
        if (!headersExist) {
            console.log('❌ [LEOVEGAS] No se encontraron las cabeceras de liga con los selectores actuales.');
            return {};
        }

        const numHeaders = await page.$$eval(selectorHeader, els => els.length);
        console.log(`📂 [LEOVEGAS] ${numHeaders} secciones encontradas.`);

        for (let i = 0; i < numHeaders; i++) {
            try {
                if (i % 20 === 0) console.log(`   ⏳ [LEOVEGAS] Procesando liga ${i + 1} de ${numHeaders}...`);

                const headers = await page.$$(selectorHeader);
                const currentHeader = headers[i];
                
                if (!currentHeader) continue;

                const nombreLiga = await page.evaluate(el => el.innerText.split('\n')[0].trim(), currentHeader);
                if (nombreLiga.toUpperCase().includes('VIVO') || !nombreLiga) continue;

                await currentHeader.scrollIntoView();
                await page.evaluate(el => el.click(), currentHeader);
                
                await new Promise(r => setTimeout(r, 500));

                const partidos = await page.evaluate((ligaNombre) => {
                    const cards = Array.from(document.querySelectorAll('[class*="eventCard"], [data-testid="event-card"]'));
                    return cards.map(card => {
                        const home = card.querySelector('[data-testid="homeName"]')?.innerText.trim();
                        const away = card.querySelector('[data-testid="awayName"]')?.innerText.trim();
                        const cuotasEls = Array.from(card.querySelectorAll('[class*="outcome-value"], [class*="label-3"]'));
                        const cuotas = cuotasEls.slice(0, 3).map(c => parseFloat(c.innerText.replace(',', '.')));
                        
                        // FIX: Se define clockElem para evitar que el script falle (Referencia nula)
                        const clockElem = card.querySelector('[class*="countdown"], [class*="time"], [data-testid="event-time"]');
                        let horaRaw = clockElem?.innerText.trim() || "";

                        if (!horaRaw) return null;

                        let horaFinal = horaRaw;

                        // Comprobamos si es una cuenta atrás (formato MM:SS o tiene clase countdown)
                        const partes = horaRaw.split(':');
                        const esCuentaAtras = partes.length === 2 && clockElem && clockElem.className.includes('countdown');

                        if (esCuentaAtras) {
                            const minutosParaEmpezar = parseInt(partes[0]);
                            const segundosParaEmpezar = parseInt(partes[1]);

                            const ahora = new Date();
                            // Sumamos los minutos y segundos a la hora actual
                            ahora.setMinutes(ahora.getMinutes() + minutosParaEmpezar);
                            ahora.setSeconds(ahora.getSeconds() + segundosParaEmpezar);

                            // Formateamos a HH:mm
                            const horasArr = ahora.getHours().toString().padStart(2, '0');
                            const minArr = ahora.getMinutes().toString().padStart(2, '0');
                            horaFinal = `${horasArr}:${minArr}`;
                        }

                        if (home && away && cuotas.length >= 2) {
                            // Se asume que en el map devuelves p.competicion, lo ajustamos a ligaNombre
                            return { home, away, hora: horaFinal, cuotas, competicion: ligaNombre };
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
            } catch (err) {
                console.log(`   ⚠️ [LEOVEGAS] Error silencioso en sección ${i}:`, err.message);
            }
        }   

        console.log(`   ✅ [LEOVEGAS] Eventos extraídos: ${Object.keys(mapaResultados).length}`);
        return mapaResultados; 
    } catch (e) {
        console.error("❌ [LEOVEGAS] Fallo:", e.message);
        return {};
    } finally {
        await page.close();
        if (!browserParam) await browser.close();
    }
}