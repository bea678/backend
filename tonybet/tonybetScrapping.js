import 'dotenv/config';
import puppeteer from 'puppeteer';

export function generarIdUnico(home, away, hora) {
    const normalizar = (str) => {
        if (!str) return "";
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/\bii\b/g, 'b') 
            .replace(/fc|sd|ud|cd|united|real|club|deportivo|atletico|atl\.|de|el|la|the|deportiva/g, '')
            .replace(/\(espana\)|\bespana\b|\besp\b/g, '')
            .replace(/[^a-z0-9]/g, '') 
            .trim();
    };

    const h = normalizar(home);
    const a = normalizar(away);
    
    const equipos = [h, a].sort().join('_');
    const horaFinal = hora.replace(/[^0-9]/g, '').slice(-4); 

    return `${horaFinal}_${equipos}`;
}

export async function scrapeTonyBetFootball() {
    const url = 'https://tonybet.es/prematch/football';
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const mapaResultados = {};

    console.log('🚀 Iniciando navegador...');
    const browser = await puppeteer.launch({
        headless: false, 
        args: ['--no-sandbox', '--window-size=1920,15000']
    });

    const page = await browser.newPage();

    page.on('console', msg => {
        const texto = msg.text();
        if (texto.startsWith('MIO:')) {
            console.log('✅ DEBUG:', texto.replace('MIO:', ''));
        }
    });

    await page.setViewport({ width: 1920, height: 15000 });

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`📡 Navegando a: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        await delay(4000); 

        const cookieBtn = '#onetrust-accept-btn-handler';
        const banner = await page.waitForSelector(cookieBtn, { timeout: 15000, visible: true }).catch(() => null);

        if (banner) {
            await page.evaluate((selector) => {
                const btn = document.querySelector(selector);
                if (btn) btn.click();
            }, cookieBtn);
            console.log('✅ Cookies cerradas.');
            await delay(2000);
        }
        
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 600;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    totalHeight += distance;
                    window.scrollBy(0, totalHeight);


                    if (totalHeight >= scrollHeight || totalHeight > 1000000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 400); 
            });
        });

        await delay(5000); 

        const partidos = await page.evaluate(() => {
            const rows = document.querySelectorAll('[data-test="eventTableRow"]');
            const lista = [];

            rows.forEach(fila => {
                const teams = fila.querySelectorAll('[data-test="teamName"] span');
                if (teams.length < 2) return;
                
                const dateEl = fila.querySelector('[data-test="eventDate"]');
                const timeEl = fila.querySelector('[data-test="eventTime"]');
                const ligaEl = fila.querySelector('[data-test="leagueLink"]');

                const fechaText = dateEl ? dateEl.innerText.trim() : 'FECHA NO ENCONTRADA';
                const horaText = timeEl ? timeEl.innerText.trim() : 'HORA NO ENCONTRADA';
                const ligaText = ligaEl ? ligaEl.innerText.trim() : 'LIGA NO ENCONTRADA';

                const t1 = teams[0].innerText.trim();
                const t2 = teams[1].innerText.trim();
                
                if (!t1 || t1 === "") return;

                const bloque1X2 = fila.querySelector('.SZxOo');
                if (bloque1X2) {
                    const cuotasNodes = bloque1X2.querySelectorAll('[data-test="outcome"]');
                    const cuotas = Array.from(cuotasNodes)
                                        .map(nodo => nodo.innerText.trim())
                                        .slice(0, 3);

                    if (cuotas.length >= 2) {
                        lista.push({ t1, t2, fechaText, horaText, cuotas, ligaText });
                    }
                }
            });
            return lista;
        });

        partidos.forEach((p, i) => {
            const key = generarIdUnico(p.t1, p.t2, p.horaText);
            mapaResultados[key] = {
                eventId: `${i}_${p.t1.substring(0,3).toUpperCase()}`,
                partido: `${p.t1} vs ${p.t2}`,
                cuotas: p.cuotas,
                competicion: p.ligaText,
                hora: p.horaText,
                fecha: p.fechaText
            };
        });
        console.log('\n--- RESULTADOS 1 X 2 ---');
        console.log(`✅ Éxito final: ${Object.keys(mapaResultados).length} eventos en el mapa.`);

        console.log('\n--- LISTADO DETALLADO ---');
        Object.entries(mapaResultados).forEach(([key, info]) => {
            console.log(`ID: ${key}`);
            console.log(`  ⚽ Partido: ${info.partido}`);
            console.log(`  📊 Cuotas: 1:${info.cuotas[0]} | X:${info.cuotas[1]} | 2:${info.cuotas[2]}`);
            console.log(`  ⏰ Hora: ${info.hora}`);
            console.log(`  🏆 Competición: ${info.competicion}`);
            console.log('---------------------------');
        });
        return mapaResultados
    } catch (error) {
        console.error('❌ Error detectado:', error.message);
    } finally {
         await browser.close();
    }
}
