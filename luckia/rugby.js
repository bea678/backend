import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

export async function scrapeLuckiaRugby() {
    const browser = await puppeteer.launch({
        headless: "true",
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
    
    // Configuración de User Agent para parecer un humano
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    const publicDir = path.join(process.cwd(), 'public');
    const mapaResultados = {};

    // --- CÁLCULO DE FECHAS (Hoy) ---
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const fechaActual = new Date();
    const diaHoy = String(fechaActual.getDate()).padStart(2, '0');
    const mesHoy = meses[fechaActual.getMonth()];
    const stringHoy = `${diaHoy} ${mesHoy}`; 

    try {
        // 2. Navegación principal
        console.log('🌐 [LUCKIA] Navegando a la sección de fútbol...');
        await page.goto('https://www.luckia.es/apuestas/rugby/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // 3. Gestión de Cookies
        try {
            const cookieBtn = 'button#onetrust-accept-btn-handler';
            await page.waitForSelector(cookieBtn, { timeout: 10000 });
            await page.click(cookieBtn);
            console.log('✅ [LUCKIA] Cookies aceptadas.');
        } catch (e) {
            console.log('ℹ️ [LUCKIA] Botón de cookies no detectado o ya aceptado.');
        }

        // 4. Localizar el iframe de apuestas
        console.log('⏳ [LUCKIA] Localizando iframe #sbtechBC...');
        await page.waitForSelector('#sbtechBC', { timeout: 35000 });
        
        const getLuckiaFrame = async () => {
            const element = await page.$('#sbtechBC');
            return await element.contentFrame();
        };

        let frame = await getLuckiaFrame();
        if (!frame) throw new Error("No se pudo acceder al contenido del iframe.");

        // 5. Scroll Dinámico y Click en "Ver más"
        console.log('🖱️ [LUCKIA] Explorando eventos en la página...');
        let intentosSinBoton = 0;
        const maxScrolls = 35; 

        for (let i = 0; i < maxScrolls; i++) {
            try {
                // Hacer scroll hasta abajo del todo dentro del iframe
                await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 1500)); // Esperamos a que cargue el lazy load

                // Evaluar si el botón existe y clicarlo
                const botonClicado = await frame.evaluate(() => {
                    const btn = document.querySelector('button#view-more-upcoming-btn');
                    if (btn && btn.offsetParent !== null && !btn.disabled) { 
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (botonClicado) {
                    intentosSinBoton = 0; // Reiniciamos contador porque hemos encontrado más partidos explícitamente
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    intentosSinBoton++;
                    // Si hacemos scroll 4 veces y no vemos el botón, asumimos que llegamos al final total
                    if (intentosSinBoton >= 4) {
                        console.log('   ✅ [LUCKIA] Fin del contenido detectado. Terminando scroll.');
                        break;
                    }
                }
            } catch (scrollError) {
                console.log('ℹ️ [LUCKIA] Contexto perdido durante el scroll, re-enganchando iframe...');
                frame = await getLuckiaFrame();
            }
        }

        // Espera para estabilizar el DOM antes de la extracción final
        await new Promise(r => setTimeout(r, 3000));

        // 6. Extracción de datos
        frame = await getLuckiaFrame();
        console.log('📊 [LUCKIA] Extrayendo partidos (Ignorando los días posteriores)...');
        
        const partidosData = await frame.evaluate(() => {
            const events = Array.from(document.querySelectorAll('.lp-event'));
            return events.map(row => {
                const home = row.querySelector('.lp-event__team-name.top .lp-event__team-name-text')?.innerText.trim();
                const away = row.querySelector('.lp-event__team-name.bottom .lp-event__team-name-text')?.innerText.trim();
                const hora = row.querySelector('.lp-event__extra-date')?.innerText.trim();
                const liga = row.closest('.lp-event-family')?.querySelector('.header-group-title strong')?.innerText.trim() || 'Fútbol';

                const market1X2 = row.querySelector('.lp-event__picks-group[data-bettypeid="3000100100000"]');
                let cuotas = null;

                if (market1X2) {
                    const picks = market1X2.querySelectorAll('.lp-event__pick-content');
                    if (picks.length === 3) {
                        cuotas = [
                            parseFloat(picks[0].innerText.replace(',', '.')),
                            parseFloat(picks[1].innerText.replace(',', '.')),
                            parseFloat(picks[2].innerText.replace(',', '.'))
                        ];
                    }
                }
                return { home, away, hora, liga, cuotas };
            }).filter(p => p.home && p.cuotas && !isNaN(p.cuotas[0]) && p.hora);
        });

        // 7. Procesar, filtrar por HOY y limpiar la hora
        partidosData.forEach((p, i) => {
            try {
                // Filtro para saber si es un partido de hoy (El resto se ignoran y no entran al mapaResultados)
                const esHoy = p.hora.includes(stringHoy) || 
                              p.hora.toLowerCase().includes('hoy') || 
                              /^\d{2}:\d{2}/.test(p.hora.trim());

                if (!esHoy) return; 

                // Extraemos ÚNICAMENTE la hora en formato HH:MM
                let horaLimpia = p.hora;
                const extraerHora = p.hora.match(/\d{2}:\d{2}/);
                if (extraerHora) {
                    horaLimpia = extraerHora[0];
                }

                const key = generarIdUnico(p.home, p.away, horaLimpia);
                mapaResultados[key] = {
                    eventId: `${i}_LUC_${p.home.substring(0,3).toUpperCase()}`,
                    partido: `${p.home} vs ${p.away}`,
                    cuotas: p.cuotas,
                    competicion: p.liga,
                    hora: horaLimpia,
                    casa: 'Luckia'
                };
            } catch (idErr) {
                // Error silencioso en generación de ID individual
            }
        });

        console.log(`✅ [LUCKIA] Éxito: ${Object.keys(mapaResultados).length} partidos de HOY procesados.`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ [LUCKIA] Error crítico:', error.message);
        try {
            await page.screenshot({ path: path.join(publicDir, 'error_luckia.png') });
            const html = await page.content();
            fs.writeFileSync(path.join(publicDir, 'error_luckia.html'), html);
        } catch (e) {}
        
        return {};
    } finally {
        console.log('🚪 [LUCKIA] Cerrando navegador...');
        await browser.close();
    }
}