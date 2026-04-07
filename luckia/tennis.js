import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

export async function scrapeLuckiaTennis() {
    const browser = await puppeteer.launch({
        headless: "true",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080',
            '--disable-connection-pool',
        ]
    });

    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    const publicDir = path.join(process.cwd(), 'public');
    const mapaResultados = {};

    try {
        console.log('🌐 [LUCKIA TENIS] Navegando a la sección de TENIS...');
        // CORRECCIÓN 1: Evitamos el cuelgue infinito esperando solo al DOM
        await page.goto('https://www.luckia.es/apuestas/tenis/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('🍪 [LUCKIA TENIS] Gestionando cookies...');
        try {
            // CORRECCIÓN 2: Búsqueda agresiva del botón "Aceptar" para evitar el bloqueo visual
            await new Promise(r => setTimeout(r, 3000));
            
            const cookieClicada = await page.evaluate(() => {
                const botones = Array.from(document.querySelectorAll('button'));
                const btnAceptar = botones.find(b => b.innerText.trim().toUpperCase() === 'ACEPTAR');
                if (btnAceptar) {
                    btnAceptar.click();
                    return true;
                }
                return false;
            });

            if (cookieClicada) {
                console.log('✅ [LUCKIA TENIS] Cookies aceptadas correctamente.');
                await new Promise(r => setTimeout(r, 2000)); 
            } else {
                console.log('ℹ️ [LUCKIA TENIS] No se encontró el botón "Aceptar" (quizás ya estaban aceptadas).');
            }
        } catch (e) {
            console.log('⚠️ [LUCKIA TENIS] Fallo menor al gestionar cookies:', e.message);
        }

        console.log('⏳ [LUCKIA TENIS] Localizando el contexto de los eventos...');
        await new Promise(r => setTimeout(r, 8000));

        // CORRECCIÓN 3: Buscador inteligente para soportar iframes o DOM nativo
        const getLuckiaFrame = async () => {
            const iframes = await page.$$('iframe');
            for (const el of iframes) {
                const f = await el.contentFrame();
                if (f && await f.$('.lp-event').catch(() => null)) {
                    return f; 
                }
            }
            return page; // Si no hay iframe, usamos la página principal
        };

        let frame = await getLuckiaFrame();
        
        const eventosExisten = await frame.$('.lp-event').catch(() => null);
        if (!eventosExisten) {
            throw new Error("No se encontró la clase '.lp-event'. La página no ha cargado los datos o estás bloqueado.");
        }
        
        console.log('✅ [LUCKIA TENIS] Contexto de datos localizado con éxito.');

        console.log('🖱️ [LUCKIA TENIS] Explorando eventos en la página...');
        let intentosSinBoton = 0;
        const maxScrolls = 25; 

        for (let i = 0; i < maxScrolls; i++) {
            try {
                await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 1500)); 

                const botonClicado = await frame.evaluate(() => {
                    const btn = document.querySelector('button#view-more-upcoming-btn');
                    if (btn && btn.offsetParent !== null && !btn.disabled) { 
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (botonClicado) {
                    intentosSinBoton = 0; 
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    intentosSinBoton++;
                    if (intentosSinBoton >= 4) {
                        console.log('   ✅ [LUCKIA TENIS] Fin del contenido detectado. Terminando scroll.');
                        break;
                    }
                }
            } catch (scrollError) {
                console.log('ℹ️ [LUCKIA TENIS] Contexto perdido durante el scroll, re-enganchando...');
                frame = await getLuckiaFrame();
            }
        }

        await new Promise(r => setTimeout(r, 3000));

        frame = await getLuckiaFrame();
        console.log('📊 [LUCKIA TENIS] Extrayendo partidos (Ignorando los días posteriores)...');
        
        const partidosData = await frame.evaluate(() => {
            const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            const fechaActual = new Date();
            const diaHoy = String(fechaActual.getDate()).padStart(2, '0');
            const mesHoy = meses[fechaActual.getMonth()];
            const stringHoy = `${diaHoy} ${mesHoy}`; 

            const events = Array.from(document.querySelectorAll('.lp-event'));
            return events.map(row => {
                const home = row.querySelector('.lp-event__team-name.top .lp-event__team-name-text')?.textContent.trim();
                const away = row.querySelector('.lp-event__team-name.bottom .lp-event__team-name-text')?.textContent.trim();
                const horaRaw = row.querySelector('.lp-event__extra-date.event-header-date-date')?.textContent.trim() || "";
                const liga = row.closest('.lp-event-family')?.querySelector('.header-group-title strong')?.textContent.trim() || 'TENIS';
                
                let hora = null;
                const horaMinuscula = horaRaw.toLowerCase();
                
                if (horaMinuscula.includes(stringHoy) || horaMinuscula.includes('hoy')) {
                    const partes = horaRaw.split(' ');
                    hora = partes[partes.length - 1]; 
                } else if (/^\d{2}:\d{2}$/.test(horaRaw.trim())) {
                    hora = horaRaw.trim();
                }

                if (!hora) return null;

                const cuotasElementos = row.querySelectorAll('.lp-event__picks-group .lp-event__pick-content');
                let cuotas = [];
                if (cuotasElementos.length >= 2) {
                    const cuota1 = parseFloat(cuotasElementos[0].textContent.replace(',', '.').trim());
                    const cuota2 = parseFloat(cuotasElementos[1].textContent.replace(',', '.').trim());
                    cuotas.push(cuota1);
                    cuotas.push(cuota2);
                }
                return { home, away, hora, liga, cuotas };
            }).filter(p => p !== null && p.home && p.cuotas && p.cuotas.length > 0 && !isNaN(p.cuotas[0]));
        });

        partidosData.forEach((p, i) => {
            try {
                const key = generarIdUnico(p.home, p.away, p.hora);
                mapaResultados[key] = {
                    eventId: `${i}_LUC_TENIS_${p.home.substring(0,3).toUpperCase()}`,
                    partido: `${p.home} vs ${p.away}`,
                    cuotas: p.cuotas,
                    competicion: p.liga,
                    hora: p.hora,
                    casa: 'Luckia'
                };
            } catch (idErr) {
                // Silencioso
            }
        });

        console.log(`✅ [LUCKIA TENIS] Éxito: ${Object.keys(mapaResultados).length} partidos de HOY procesados.`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ [LUCKIA TENIS] Error crítico:', error.message);
        try {
            // Aseguramos que el directorio exista antes de guardar la foto para que no pete
            if (!fs.existsSync(publicDir)) {
                fs.mkdirSync(publicDir, { recursive: true });
            }
            await page.screenshot({ path: path.join(publicDir, 'error_luckia_tenis.png') });
            const html = await page.content();
            fs.writeFileSync(path.join(publicDir, 'error_luckia_tenis.html'), html);
            console.log('📸 [LUCKIA TENIS] Nueva captura de error guardada en /public');
        } catch (e) {
            console.error('⚠️ No se pudo guardar la captura de error:', e.message);
        }
        return {};
    } finally {
        console.log('🚪 [LUCKIA TENIS] Cerrando navegador...');
        await browser.close();
    }
}