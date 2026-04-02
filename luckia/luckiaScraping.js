import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../bearbitrage/scrape.js';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

export async function scrapeLuckiaFootball() {
    const ngrokAddr = '5.tcp.eu.ngrok.io:19911'; 

    console.log(`🚀 [LUCKIA] Iniciando radar vía Ngrok-TCP`);

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
            '--disable-connection-pool',
            `--proxy-server=http://${ngrokAddr}`
        ]
    });

    const page = await browser.newPage();
    
    // Configuración de User Agent para parecer un humano
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    const publicDir = path.join(process.cwd(), 'public');
    const mapaResultados = {};

    try {
        // 1. Verificación de IP (Crucial para saber si el túnel sigue vivo)
        console.log('📡 [LUCKIA] Verificando IP de salida...');
        try {
            await page.goto('https://api.ipify.org', { waitUntil: 'networkidle2', timeout: 15000 });
            const myIp = await page.evaluate(() => document.body.innerText);
            console.log(`🌍 [LUCKIA] IP Confirmada: ${myIp} (Tu casa)`);
        } catch (e) {
            console.log('⚠️ [LUCKIA] No se pudo verificar la IP, pero intentamos Luckia...');
        }

        // 2. Navegación principal
        console.log('🌐 [LUCKIA] Navegando a la sección de fútbol...');
        await page.goto('https://www.luckia.es/apuestas/futbol/', {
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
        
        // Función interna para obtener el frame de forma segura
        const getLuckiaFrame = async () => {
            const element = await page.$('#sbtechBC');
            return await element.contentFrame();
        };

        let frame = await getLuckiaFrame();
        if (!frame) throw new Error("No se pudo acceder al contenido del iframe.");

        // 5. Scroll Robusto (Evita el error de Context Destroyed)
        console.log('🖱️ [LUCKIA] Cargando más eventos con scroll...');
        try {
            await frame.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    let distance = 500;
                    let timer = setInterval(() => {
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= 3500) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 300);
                });
            });
        } catch (scrollError) {
            console.log('ℹ️ [LUCKIA] El contexto cambió durante el scroll, reintentando extracción...');
        }

        // Espera de seguridad para que las cuotas se estabilicen
        await new Promise(r => setTimeout(r, 4000));

        // 6. Extracción de datos (Re-localizamos el frame por si hubo refresco)
        frame = await getLuckiaFrame();
        console.log('📊 [LUCKIA] Extrayendo partidos finales...');
        
        const partidosData = await frame.evaluate(() => {
            const events = Array.from(document.querySelectorAll('.lp-event'));
            return events.map(row => {
                const home = row.querySelector('.lp-event__team-name.top .lp-event__team-name-text')?.innerText.trim();
                const away = row.querySelector('.lp-event__team-name.bottom .lp-event__team-name-text')?.innerText.trim();
                const hora = row.querySelector('.lp-event__extra-date')?.innerText.trim();
                const liga = row.closest('.lp-event-family')?.querySelector('.header-group-title strong')?.innerText.trim() || 'Fútbol';

                // Selector de mercado 1X2
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
            }).filter(p => p.home && p.cuotas && !isNaN(p.cuotas[0]));
        });

        // 7. Procesar y guardar resultados
        partidosData.forEach((p, i) => {
            try {
                const key = generarIdUnico(p.home, p.away, p.hora);
                mapaResultados[key] = {
                    eventId: `${i}_LUC_${p.home.substring(0,3).toUpperCase()}`,
                    partido: `${p.home} vs ${p.away}`,
                    cuotas: p.cuotas,
                    competicion: p.liga,
                    hora: p.hora,
                    casa: 'Luckia'
                };
            } catch (idErr) {
                // Error silencioso en generación de ID
            }
        });

        console.log(`✅ [LUCKIA] Éxito: ${Object.keys(mapaResultados).length} partidos procesados.`);
        return mapaResultados;

    } catch (error) {
        console.error('❌ [LUCKIA] Error crítico:', error.message);
        
        // Guardar captura de pantalla en caso de error para ver qué pasó
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