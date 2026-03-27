import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import { PORT } from './config.js';
import puppeteer from 'puppeteer';

const app = express();

async function scrapeLeoVegasConsola() {
    const browser = await puppeteer.launch({ 
        headless: false, 
        args: ['--no-sandbox', '--window-size=1920,1080'] 
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    page.on('console', msg => {
        if (!msg.text().includes('Datadog') && !msg.text().includes('Unsatisfied')) {
            console.log(`${msg.text()}`);
        }
    });

    try {
        console.log('🌐 Navegando a LeoVegas...');
        await page.goto('https://www.leovegas.es/apuestas-deportivas#all-sports', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // 1. APLICAR FILTRO "PRÓXIMAS 24H"
        console.log('⏳ Cambiando a Próximas 24h...');
        await page.waitForSelector('[data-testid="togglebutton-container"]', { timeout: 15000 });

        await page.evaluate(() => {
            const contenedor = document.querySelector('[data-testid="togglebutton-container"]');
            const botones = Array.from(contenedor.querySelectorAll('button'));
            const boton24h = botones.find(btn => btn.innerText.includes('Próximas 24h'));
            if (boton24h) boton24h.click();
        });

        await new Promise(r => setTimeout(r, 4000));

        // 2. DETECTAR ACORDEONES
        const headers = await page.$$('.headerContainer__alxl3');
        console.log(`🔎 Analizando ${headers.length} secciones de ligas...`);

        const todosLosResultados = [];

        for (let i = 0; i < headers.length; i++) {
            try {
                // Capturamos el nombre de la liga desde el header antes de clickear
                const nombreLiga = await page.evaluate(el => {
                    const titleEl = el.querySelector('.title__Doa6k');
                    return titleEl ? titleEl.innerText.trim() : "Liga Desconocida";
                }, headers[i]);

                await headers[i].scrollIntoView();
                await new Promise(r => setTimeout(r, 400));

                await page.evaluate((el) => el.click(), headers[i]);
                await new Promise(r => setTimeout(r, 1000));

                // Pasamos 'nombreLiga' a la función evaluate
                const partidos = await page.evaluate((idx, liga) => {
                    const container = document.querySelectorAll('.accordionContainer__nKzkO')[idx];
                    if (!container) return [];

                    // Filtro Anti-Live Global
                    if (container.innerText.includes('AHORA EN VIVO') || container.innerText.includes('EN DIRECTO')) {
                        return [];
                    }

                    const tarjetas = container.querySelectorAll('[class*="eventCard__cfvtT"]');
                    const lista = [];

                    tarjetas.forEach(tarjeta => {
                        const home = tarjeta.querySelector('[data-testid="homeName"]');
                        const away = tarjeta.querySelector('[data-testid="awayName"]');
                        const cuotasNodes = tarjeta.querySelectorAll('.label-3__PJ0vg');
                        const clock = tarjeta.querySelector('[data-testid="clock"]');
                        
                        const homeText = home ? home.innerText.trim() : "";
                        const awayText = away ? away.innerText.trim() : "";
                        const tiempoText = clock ? clock.innerText : "";

                        const esLive = tiempoText.includes("'");
                        const esESports = homeText.includes('(') || awayText.includes('(');

                        if (homeText && awayText && cuotasNodes.length >= 3 && !esLive && !esESports) {
                            const cuotas = Array.from(cuotasNodes).map(c => c.innerText.trim());
                            const cuotasValidas = cuotas.filter(v => v !== '-' && v !== '');

                            if (cuotasValidas.length >= 3) {
                                console.log(`🎯 ${liga}: ${homeText} vs ${awayText} | ${cuotas.join(' | ')}`);
                                console.log('apuestas validas:', cuotas.join(' | '));
                                lista.push({
                                    liga: liga, // Guardamos el nombre de la liga aquí
                                    partido: `${homeText} vs ${awayText}`,
                                    apuestas: cuotas.join(' | ')
                                });
                            }
                        }
                    });
                    return lista;
                }, i, nombreLiga);

                if (partidos.length > 0) {
                    console.log(`✅ ${nombreLiga}: +${partidos.length} partidos.`);
                    todosLosResultados.push(...partidos);
                }

            } catch (err) {
                console.log(`⚠️ Error en liga ${i}: ${err.message}`);
            }
        }

        // 3. GUARDAR RESULTADO EN TABLA
        if (todosLosResultados.length > 0) {
            const htmlContent = `
                <html>
                <head><meta charset="UTF-8"><style>
                    body{font-family:sans-serif;padding:20px;background:#f9f9f9;} 
                    table{width:100%;border-collapse:collapse;background:#fff;box-shadow: 0 2px 5px rgba(0,0,0,0.1);} 
                    th,td{padding:12px;border:1px solid #ddd;text-align:left;} 
                    th{background:#ff6600;color:white;}
                    tr:nth-child(even){background:#f2f2f2;}
                </style></head>
                <body>
                    <h1>⚽ LeoVegas - Próximas 24h</h1>
                    <p>Actualizado: ${new Date().toLocaleString()}</p>
                    <table>
                        <tr>
                            <th>Liga</th>
                            <th>Partido</th>
                            <th>1 | X | 2</th>
                        </tr>
                        ${todosLosResultados.map(r => `
                            <tr>
                                <td><strong>${r.liga}</strong></td>
                                <td>${r.partido}</td>
                                <td>${r.apuestas}</td>
                            </tr>
                        `).join('')}
                    </table>
                </body>
                </html>`;
            await fs.writeFile('resultado_final_24h.html', htmlContent);
            console.log(`\n🏁 ¡LISTO! ${todosLosResultados.length} partidos guardados con su liga.`);
        }

    } catch (e) {
        console.error("❌ Error General:", e.message);
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Radar activo en puerto ${PORT}`);
    scrapeLeoVegasConsola();
});