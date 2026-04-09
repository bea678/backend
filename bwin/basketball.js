import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

/**
 * Parsea el texto crudo para baloncesto cogiendo las últimas dos cuotas (Money Line)
 */
function parsearPartidosBwin(textoCrudo) {
    const lineas = textoCrudo.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const partidos = [];
    let ligaActual = 'Desconocida';

    for (let i = 0; i < lineas.length; i++) {
        if (lineas[i].includes(' | ')) {
            ligaActual = lineas[i];
            continue;
        }

        const esTiempo = /^(\d{2}:\d{2}|\(en \d+ min\)|Descanso|\dT • \d{2}:\d{2}|Finalizado.*)$/i.test(lineas[i]);
        
        if (esTiempo) {
            try {
                const hora = lineas[i];
                const equipoLocal = lineas[i + 1];
                const equipoVisitante = lineas[i + 2];
                const cuotasLeidas = [];
                let j = i + 3; 
                let intentos = 0;
                
                while (j < lineas.length && intentos < 30) {
                    const lineaAnalizada = lineas[j];
                    if (/^(\d{2}:\d{2}|\(en \d+ min\)|Descanso|\dT • \d{2}:\d{2})$/i.test(lineaAnalizada)) break; 
                    
                    if (/^\d+[\.,]\d{2}$/.test(lineaAnalizada)) {
                        cuotasLeidas.push(parseFloat(lineaAnalizada.replace(',', '.')));
                    }
                    j++; intentos++;
                }

                // Lógica baloncesto: las últimas 2 cuotas son el Ganador
                if (cuotasLeidas.length >= 2) {
                    const cuotasMoneyLine = [
                        cuotasLeidas[cuotasLeidas.length - 2], 
                        cuotasLeidas[cuotasLeidas.length - 1]
                    ];

                    partidos.push({
                        liga: ligaActual,
                        hora: hora,
                        local: equipoLocal,
                        visitante: equipoVisitante,
                        cuotas: cuotasMoneyLine 
                    });
                }
            } catch (e) {}
        }
    }
    return partidos;
}

// --- FUNCIÓN PRINCIPAL ---
export async function scrapeBwinBasketball(browserParam) {    
    const browser = browserParam || await puppeteer.launch({
        headless: false, // Puesto en false para que veas el scroll
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
        ]
    });

    const page = await browser.newPage();
    const publicDir = path.join(process.cwd(), 'public');
    const mapaResultados = {};

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        console.log('🌐 [BWIN-BSK] Navegando a la página de Baloncesto...');
        await page.goto('https://www.bwin.es/es/sports/baloncesto-7/hoy', { waitUntil: 'domcontentloaded', timeout: 80000 });

        console.log('⏳ [BWIN-BSK] Esperando renderizado (9s)...');
        await new Promise(r => setTimeout(r, 9000)); 

        console.log('🍪 [BWIN-BSK] Buscando cookies...');
        try {
            const acceptCookiesBtn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 6000, visible: true });
            if (acceptCookiesBtn) {
                await acceptCookiesBtn.click();
                await new Promise(r => setTimeout(r, 1000)); 
            }
        } catch (error) { }

        console.log('🤖 [BWIN-BSK] Pausa pre-scroll...');
        await new Promise(r => setTimeout(r, 3000));
        
        console.log('⏬ [BWIN-BSK] Iniciando scroll (Lógica idéntica a Fútbol)...');
        const textoCompleto = await page.evaluate(async () => {
            return new Promise((resolve) => {
                const getScrollableContainer = () => {
                    const candidates = document.querySelectorAll('ms-main, .grid-layout, #main-view, .scroll-content');
                    for (let el of candidates) {
                        if (el && el.scrollHeight > el.clientHeight) return el;
                    }
                    // Plan B idéntico a tu script de fútbol
                    return Array.from(document.querySelectorAll('*')).reduce((acc, el) => {
                        if (el.scrollHeight > el.clientHeight && el.clientHeight > 400) {
                            return (!acc || el.scrollHeight > acc.scrollHeight) ? el : acc;
                        }
                        return acc;
                    }, document.scrollingElement);
                };

                const targetContainer = getScrollableContainer();
                
                let totalHeight = 0;
                const distance = 500; 
                let scrolls = 0;
                const maxScrolls = 200; 
                let textoAcumulado = "";

                const timer = setInterval(() => {
                    if (targetContainer && targetContainer.scrollBy) {
                        targetContainer.scrollBy(0, distance);
                    } else if (targetContainer) {
                        targetContainer.scrollTop += distance;
                    }

                    totalHeight += distance;
                    scrolls++;

                    const contenedorTexto = document.querySelector('ms-main, ms-event-group, body');
                    if (contenedorTexto) {
                        textoAcumulado += "\n" + contenedorTexto.innerText;
                    }

                    const limitHeight = targetContainer ? targetContainer.scrollHeight : document.body.scrollHeight;
                    
                    if (totalHeight >= limitHeight || scrolls >= maxScrolls) {
                        clearInterval(timer);
                        resolve(textoAcumulado);
                    }
                }, 1200); 
            });
        });

        const todosLosPartidos = parsearPartidosBwin(textoCompleto);

        console.log('📊 [BWIN-BSK] Estructurando mapa de resultados...');
        todosLosPartidos.forEach((partido, i) => {
            try {
                // Descartar en vivo
                if (/^[1-4]C •|^[12]T •|Descanso|Finalizado/i.test(partido.hora)) return; 
                
                let horaLimpia = partido.hora;
                const matchMinutos = partido.hora.match(/en (\d+) min/i);
                if (matchMinutos) {
                    const fecha = new Date();
                    fecha.setMinutes(fecha.getMinutes() + parseInt(matchMinutos[1], 10));
                    horaLimpia = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
                } else {
                    const extraerHora = partido.hora.match(/\d{2}:\d{2}/);
                    if (extraerHora) horaLimpia = extraerHora[0];
                }

                const key = generarIdUnico(partido.local, partido.visitante, horaLimpia);
                if (key) {
                    mapaResultados[key] = {
                        eventId: `${i}_BWI_BSK_${partido.local.substring(0,3).toUpperCase()}`,
                        partido: `${partido.local} vs ${partido.visitante}`,
                        cuotas: partido.cuotas, 
                        competicion: partido.liga,
                        hora: horaLimpia,
                        casa: 'Bwin'
                    };
                }
            } catch (err) {}
        });

        //const outPath = path.join(process.cwd(), 'bwin_baloncesto.json');
        //fs.writeFileSync(outPath, JSON.stringify(mapaResultados, null, 4), 'utf8');
        
        console.log(`✅ [BWIN-BSK] Éxito: ${Object.keys(mapaResultados).length} partidos guardados.`);
        return mapaResultados;

    } catch (error) {
        console.error("❌ [BWIN-BSK] Error crítico:", error.message);
        return {};
    } finally {
        if (!browserParam) {
            await new Promise(r => setTimeout(r, 2000)); 
            await browser.close();
        } else {
            await page.close();
        }
    }
}