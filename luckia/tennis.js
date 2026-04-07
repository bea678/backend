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
            '--no-zygote',
            '--single-process',
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
        await page.goto('https://www.luckia.es/apuestas/tenis/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        try {
            const cookieBtn = 'button#onetrust-accept-btn-handler';
            await page.waitForSelector(cookieBtn, { timeout: 10000 });
            await page.click(cookieBtn);
            console.log('✅ [LUCKIA TENIS] Cookies aceptadas.');
        } catch (e) {
            console.log('ℹ️ [LUCKIA TENIS] Botón de cookies no detectado o ya aceptado.');
        }

        console.log('⏳ [LUCKIA TENIS] Localizando iframe #sbtechBC...');
        await page.waitForSelector('#sbtechBC', { timeout: 35000 });
        
        const getLuckiaFrame = async () => {
            const element = await page.$('#sbtechBC');
            return await element.contentFrame();
        };

        let frame = await getLuckiaFrame();
        if (!frame) throw new Error("No se pudo acceder al contenido del iframe.");

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
                console.log('ℹ️ [LUCKIA TENIS] Contexto perdido durante el scroll, re-enganchando iframe...');
                frame = await getLuckiaFrame();
            }
        }

        await new Promise(r => setTimeout(r, 3000));

        frame = await getLuckiaFrame();
        console.log('📊 [LUCKIA TENIS] Extrayendo partidos (Ignorando los días posteriores)...');
        
        const partidosData = await frame.evaluate(() => {
            // Arrays en minúscula para que coincida perfectamente
            const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            const fechaActual = new Date();
            const diaHoy = String(fechaActual.getDate()).padStart(2, '0');
            const mesHoy = meses[fechaActual.getMonth()];
            const stringHoy = `${diaHoy} ${mesHoy}`; 

            const events = Array.from(document.querySelectorAll('.lp-event'));
            return events.map(row => {
                // Cambiado todo a textContent para evitar problemas de parseo
                const home = row.querySelector('.lp-event__team-name.top .lp-event__team-name-text')?.textContent.trim();
                const away = row.querySelector('.lp-event__team-name.bottom .lp-event__team-name-text')?.textContent.trim();
                
                // CORRECCIÓN: row.querySelector y fallback a string vacío
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
            // CORRECCIÓN: p !== null para que no pete al leer nulos
            }).filter(p => p !== null && p.home && p.cuotas && p.cuotas.length > 0 && !isNaN(p.cuotas[0]));
        });

        // CORRECCIÓN: usamos p.hora en lugar de la variable fantasma horaLimpia
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
            await page.screenshot({ path: path.join(publicDir, 'error_luckia_tenis.png') });
            const html = await page.content();
            fs.writeFileSync(path.join(publicDir, 'error_luckia_tenis.html'), html);
        } catch (e) {}
        return {};
    } finally {
        console.log('🚪 [LUCKIA TENIS] Cerrando navegador...');
        await browser.close();
    }
}