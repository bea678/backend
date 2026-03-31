import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generarIdUnico } from '../scrapeArbitrage.js';

puppeteer.use(StealthPlugin());

export async function scrapeLuckiaFootball() {
    console.log('🚀 Iniciando navegador...');
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    const mapaResultados = {};

    try {
        console.log('🌐 Navegando a Luckia (esperando networkidle2)...');
        await page.goto('https://www.luckia.es/apuestas/futbol/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        console.log('✅ Página base cargada.');

        console.log('🍪 Buscando botón de cookies...');
        const cookieBtn = 'button#onetrust-accept-btn-handler';
        try {
            await page.waitForSelector(cookieBtn, { timeout: 5000 });
            await page.click(cookieBtn);
            console.log('✅ Cookies aceptadas.');
        } catch (e) {
            console.log('ℹ️ No apareció el botón de cookies o ya estaban aceptadas.');
        }

        console.log('⏳ Localizando el iframe #sbtechBC...');
        await page.waitForSelector('#sbtechBC', { timeout: 20000 });
        const frameElement = await page.$('#sbtechBC');
        console.log('✅ Elemento iframe encontrado. Accediendo al contenido...');
        
        const frame = await frameElement.contentFrame();
        if (!frame) throw new Error("No se pudo acceder al contenido interno del iframe.");
        console.log('✅ Dentro del iframe correctamente.');

        console.log('⏳ Esperando a que aparezcan los eventos (.lp-event)...');
        await frame.waitForSelector('.lp-event', { timeout: 30000 });
        console.log('✅ Eventos detectados en el DOM.');

        console.log('📊 Ejecutando extracción de datos (evaluate)...');
        const partidosData = await frame.evaluate(() => {
            const events = Array.from(document.querySelectorAll('.lp-event'));
            console.log(`Debug interno: encontrados ${events.length} elementos .lp-event`);
            
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
            }).filter(p => p.home && p.cuotas);
        });

        console.log(`✅ Extracción terminada. Procesando ${partidosData.length} partidos filtrados...`);

        partidosData.forEach((p, i) => {
            try {
                const key = generarIdUnico(p.home, p.away, p.hora);
                mapaResultados[key] = {
                    eventId: `${i}_${p.home.substring(0,3).toUpperCase()}`,
                    partido: `${p.home} vs ${p.away}`,
                    cuotas: p.cuotas,
                    competicion: p.liga,
                    hora: p.hora
                };
            } catch (err) {
                console.error(`❌ Error generando ID para: ${p.home} vs ${p.away}`, err.message);
            }
        });

        console.log(`✅ Éxito final: ${Object.keys(mapaResultados).length} eventos en el mapa.`);
        return mapaResultados;
    } catch (error) {
        console.error('❌ Error crítico en el proceso de Luckia:', error.message);
        await page.screenshot({ path: 'error_luckia.png' });
        console.log('📸 Captura de error guardada como error_luckia.png');
        return {};
    } finally {
        console.log('🚪 Cerrando navegador...');
        await browser.close();
    }
}