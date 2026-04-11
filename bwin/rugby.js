import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

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
                const cuotas = [];
                let j = i + 3; 
                let intentos = 0;
                
                while (j < lineas.length && cuotas.length < 3 && intentos < 12) {
                    const lineaAnalizada = lineas[j];
                    if (/^(\d{2}:\d{2}|\(en \d+ min\)|Descanso|\dT • \d{2}:\d{2})$/i.test(lineaAnalizada)) break; 
                    if (/^\d+[\.,]\d{2}$/.test(lineaAnalizada)) {
                        cuotas.push(parseFloat(lineaAnalizada.replace(',', '.')));
                    }
                    j++; intentos++;
                }

                if (cuotas.length >= 3) {
                    partidos.push({
                        liga: ligaActual,
                        hora: hora,
                        local: equipoLocal,
                        visitante: equipoVisitante,
                        cuotas: { '1': cuotas[0], 'X': cuotas[1], '2': cuotas[2] }
                    });
                }
            } catch (e) {}
        }
    }
    return partidos;
}

// --- FUNCIÓN PRINCIPAL ---
export async function scrapeBwinRugby(browserParam) {    
    const browser = browserParam || await puppeteer.launch({
        headless: "true", 
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

        console.log('🌐 [BWIN] Navegando a la página...');
        await page.goto('https://www.bwin.es/es/sports/rugby-union-32/hoy', { waitUntil: 'domcontentloaded', timeout: 80000 });

        // Pausa de renderizado visual
        console.log('⏳ [BWIN] Esperando a que el motor JavaScript construya la interfaz visual...');
        await new Promise(r => setTimeout(r, 9000)); 

        console.log('🍪 [BWIN] Buscando banner de cookies...');
        try {
            const acceptCookiesBtn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 6000, visible: true });
            if (acceptCookiesBtn) {
                await acceptCookiesBtn.click();
                await new Promise(r => setTimeout(r, 1000)); 
            }
        } catch (error) { /* Sin banner */ }

        console.log('🤖 [BWIN] Simulando lectura inicial...');
        await new Promise(r => setTimeout(r, 3000));
        
        console.log('⏬ [BWIN] Buscando contenedor interno y haciendo scroll...');
        const textoCompleto = await page.evaluate(async () => {
            return new Promise((resolve) => {
                const getScrollableContainer = () => {
                    const candidates = document.querySelectorAll('ms-main, .grid-layout, #main-view, .scroll-content');
                    for (let el of candidates) {
                        if (el && el.scrollHeight > el.clientHeight) return el;
                    }
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
        console.log('✅ [BWIN] Lectura y scroll completados.');

        const todosLosPartidos = parsearPartidosBwin(textoCompleto);

        // --- CONVERSIÓN DE LOS DATOS AL MAPA ---
        console.log('📊 [BWIN] Estructurando resultados en el mapa y parseando horas...');
        
        todosLosPartidos.forEach((partido, i) => {
            try {
                let horaLimpia = partido.hora;

                // 1. DESCARTAR partidos EN VIVO o FINALIZADOS
                if (/^[12]T •|Descanso|Finalizado/i.test(partido.hora)) {
                    return; 
                } 
                
                // 2. Detectar si dice "(en X min)" o similar
                const matchMinutos = partido.hora.match(/en (\d+) min/i);
                if (matchMinutos) {
                    const minutosSumar = parseInt(matchMinutos[1], 10);
                    const fechaCalculada = new Date();
                    fechaCalculada.setMinutes(fechaCalculada.getMinutes() + minutosSumar);
                    
                    const horasStr = String(fechaCalculada.getHours()).padStart(2, '0');
                    const minStr = String(fechaCalculada.getMinutes()).padStart(2, '0');
                    horaLimpia = `${horasStr}:${minStr}`;
                } 
                // 3. Si no es relativo, buscamos una hora estándar HH:MM
                else {
                    const extraerHora = partido.hora.match(/\d{2}:\d{2}/);
                    if (extraerHora) {
                        horaLimpia = extraerHora[0];
                    }
                }

                const key = generarIdUnico(partido.local, partido.visitante, horaLimpia);
                
                // Se guarda solo si la clave es válida
                if (key) {
                    mapaResultados[key] = {
                        eventId: `${i}_BWI_${partido.local.substring(0,3).toUpperCase()}`,
                        partido: `${partido.local} vs ${partido.visitante}`,
                        cuotas: [partido.cuotas['1'], partido.cuotas['X'], partido.cuotas['2']],
                        competicion: partido.liga,
                        hora: horaLimpia,
                        casa: 'Bwin'
                    };

                    console.log('Partido: ', `${partido.local} vs ${partido.visitante}`)
                    console.log('Cuotas: ', [partido.cuotas['1'], partido.cuotas['X'], partido.cuotas['2']])
                    console.log('Hora: ', horaLimpia)
                }
            } catch (idErr) {
                // Silenciamos el error por partido individual
            }
        });

        console.log(`✅ [BWIN] ¡Éxito! Se procesaron ${Object.keys(mapaResultados).length} partidos únicos pre-partido.`);

        return mapaResultados;

    } catch (error) {
        console.error("❌ [BWIN] Fallo crítico:", error.message);
        try {
            if (!fs.existsSync(publicDir)) {
                fs.mkdirSync(publicDir, { recursive: true });
            }
            await page.screenshot({ path: path.join(publicDir, 'error_bwin.png') });
            const html = await page.content();
            fs.writeFileSync(path.join(publicDir, 'error_bwin.html'), html);
        } catch (e) {
            console.log('No se pudo guardar el reporte de error visual.');
        }
        
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