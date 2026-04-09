import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

/**
 * Parsea el texto crudo para Hockey sobre Hielo
 */
function parsearPartidosBwin(textoCrudo) {
    const lineas = textoCrudo.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const partidos = [];
    let ligaActual = 'Desconocida';

    for (let i = 0; i < lineas.length; i++) {
        // Detectar Liga / Torneo
        if (lineas[i].includes(' | ') || lineas[i].includes(' - PLAYOFFS')) {
            ligaActual = lineas[i];
            continue;
        }

        // Detectar marcador de tiempo
        const esTiempo = /^(\d{2}:\d{2}|\(en \d+ min\)|Descanso|\dT • \d{2}:\d{2}|Finalizado.*)$/i.test(lineas[i]);
        
        if (esTiempo) {
            try {
                const hora = lineas[i];
                const equipoLocal = lineas[i + 1];
                const equipoVisitante = lineas[i + 2];
                const cuotasLeidas = [];
                let j = i + 3; 
                let intentos = 0;
                
                // Recolectamos todas las cuotas del bloque
                while (j < lineas.length && intentos < 30) {
                    const lineaAnalizada = lineas[j];
                    if (/^(\d{2}:\d{2}|\(en \d+ min\)|Descanso|\dT • \d{2}:\d{2})$/i.test(lineaAnalizada)) break; 
                    
                    if (/^\d+[\.,]\d{2}$/.test(lineaAnalizada)) {
                        cuotasLeidas.push(parseFloat(lineaAnalizada.replace(',', '.')));
                    }
                    j++; intentos++;
                }

                // Lógica Hockey: El Money Line (Ganador) son las 2 últimas cuotas del bloque
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
export async function scrapeBwinHockey(browserParam) {    
    const browser = browserParam || await puppeteer.launch({
        headless: true,
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
    const mapaResultados = {};

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        console.log('🌐 [BWIN-HOCKEY] Navegando a Hockey Hoy...');
        await page.goto('https://www.bwin.es/es/sports/hockey-sobre-hielo-12/hoy', { waitUntil: 'domcontentloaded', timeout: 80000 });

        console.log('⏳ [BWIN-HOCKEY] Esperando renderizado (9s)...');
        await new Promise(r => setTimeout(r, 9000)); 

        try {
            const acceptBtn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 6000 });
            await acceptBtn.click();
        } catch (error) { }

        console.log('⏬ [BWIN-HOCKEY] Iniciando scroll dinámico...');
        const textoCompleto = await page.evaluate(async () => {
            return new Promise((resolve) => {
                const getScrollableContainer = () => {
                    const candidates = document.querySelectorAll('ms-main, .grid-layout, #main-view, .scroll-content');
                    for (let el of candidates) {
                        if (el && el.scrollHeight > el.clientHeight) return el;
                    }
                    return document.scrollingElement;
                };

                const targetContainer = getScrollableContainer();
                let totalHeight = 0;
                let scrolls = 0;
                let textoAcumulado = "";

                const timer = setInterval(() => {
                    if (targetContainer && targetContainer.scrollBy) {
                        targetContainer.scrollBy(0, 500);
                    } else {
                        window.scrollBy(0, 500);
                    }

                    totalHeight += 500;
                    scrolls++;
                    textoAcumulado += "\n" + document.body.innerText;

                    if (totalHeight >= (targetContainer ? targetContainer.scrollHeight : document.body.scrollHeight) || scrolls >= 150) {
                        clearInterval(timer);
                        resolve(textoAcumulado);
                    }
                }, 1200); 
            });
        });

        const todosLosPartidos = parsearPartidosBwin(textoCompleto);

        console.log('📊 [BWIN-HOCKEY] Estructurando mapa de resultados...');
        todosLosPartidos.forEach((partido, i) => {
            try {
                // FILTRO: Descartar En vivo
                if (/^[1-3]P •|Descanso|Finalizado/i.test(partido.hora)) return; 
                
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
                        eventId: `${i}_BWI_HOC_${partido.local.substring(0,3).toUpperCase()}`,
                        partido: `${partido.local} vs ${partido.visitante}`,
                        cuotas: partido.cuotas, 
                        competicion: partido.liga,
                        hora: horaLimpia,
                        casa: 'Bwin'
                    };
                }
            } catch (err) {}
        });

        //const outPath = path.join(process.cwd(), 'bwin_hockey.json');
        //fs.writeFileSync(outPath, JSON.stringify(mapaResultados, null, 4), 'utf8');
        
        console.log(`✅ [BWIN-HOCKEY] Éxito: ${Object.keys(mapaResultados).length} partidos guardados.`);
        return mapaResultados;

    } catch (error) {
        console.error("❌ [BWIN-HOCKEY] Error crítico:", error.message);
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