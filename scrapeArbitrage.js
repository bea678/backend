import { scrapeBetfairFootball } from "./betfair/betfairScrapping.js";
import { scrapeLeoVegasFootball } from "./leovegas/leovegasScrapping.js";
import { scrapeLuckiaFootball } from "./luckia/luckiaScraping.js";
import { scrapeTonyBetFootball } from "./tonybet/tonybetScrapping.js";
import fs from 'fs/promises';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export function obtenerHoraInicio(minutosParaEmpezar) {
    const ahora = new Date();
    const horaInicio = new Date(ahora.getTime() + (minutosParaEmpezar || 0) * 60000);
    return `${horaInicio.getHours().toString().padStart(2, '0')}:${horaInicio.getMinutes().toString().padStart(2, '0')}`;
}

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

export function calcularDetalleArbitraje(q1, qX, q2) {
    if (!q1 || !qX || !q2) return { hayArbitraje: false };
    const prob = (1 / q1) + (1 / qX) + (1 / q2);
    if (prob >= 1.0) return { hayArbitraje: false };

    const roi = ((1 / prob) - 1) * 100;
    return {
        hayArbitraje: true,
        roi: roi.toFixed(2),
        stakes: {
            local: (100 / (q1 * prob)).toFixed(2),
            empate: (100 / (qX * prob)).toFixed(2),
            visitante: (100 / (q2 * prob)).toFixed(2)
        }
    };
}

function unificarCuotas(fuentes) {
    console.log('\n🧠 Unificando mercados de todas las fuentes...');
    const master = {};

    fuentes.forEach(({ nombre, data }) => {
        if (!data) return;
        const llaves = Object.keys(data);
        console.log(`   🔹 [${nombre}] Procesando ${llaves.length} partidos.`);

        llaves.forEach(key => {
            const p = data[key];
            if (!master[key]) {
                master[key] = {
                    partido: p.partido,
                    hora: p.hora,
                    mejoresCuotas: [0, 0, 0],
                    origen: ['', '', ''],
                    detalles: {}
                };
            }
            
            master[key].detalles[nombre] = p.cuotas;

            p.cuotas.forEach((cuota, i) => {
                if (cuota > master[key].mejoresCuotas[i]) {
                    master[key].mejoresCuotas[i] = cuota;
                    master[key].origen[i] = nombre;
                }
            });
        });
    });
    return master;
}

// --- FUNCIÓN PRINCIPAL CON GESTIÓN DE CACHÉ INTELIGENTE ---

export async function scrapeArbitrageFootball() {
    console.log('--- 🚀 INICIANDO RADAR MULTICASA ---');
    
    let bfData, lvData, lcData;
    
    try {
        console.log('📂 Verificando archivos de caché...');
        
        // Intentamos leer los 3 archivos en paralelo para ahorrar tiempo
        const [bfCache, lvCache, lcCache, tonyCache] = await Promise.all([
            fs.readFile('betfair_cache.json', 'utf-8'),
            fs.readFile('leovegas_cache.json', 'utf-8'),
            fs.readFile('luckia_cache.json', 'utf-8'),
            fs.readFile('tonybet_cache.json', 'utf-8')
        ]);

        bfData = JSON.parse(bfCache);
        lvData = JSON.parse(lvCache);
        lcData = JSON.parse(lcCache);
        tonyData = JSON.parse(tonyCache);

        console.log('✅ Datos cargados desde la caché local para agilizar.');

    } catch (e) {
        console.log('🌐 Caché incompleta o no encontrada. Iniciando scrapers (esto tardará un poco)...');
        
        // Si falla la lectura de cualquiera, ejecutamos los scrapers
        [bfData, lvData, lcData, tonyData] = await Promise.all([
            scrapeBetfairFootball(), 
            scrapeLeoVegasFootball(), 
            scrapeLuckiaFootball(),
            scrapeTonyBetFootball()
        ]);

        // Guardamos los nuevos datos en caché para la próxima vez
        await Promise.all([
            fs.writeFile('betfair_cache.json', JSON.stringify(bfData, null, 2)),
            fs.writeFile('leovegas_cache.json', JSON.stringify(lvData, null, 2)),
            fs.writeFile('luckia_cache.json', JSON.stringify(lcData, null, 2)),
            fs.writeFile('tonybet_cache.json', JSON.stringify(tonyData, null, 2))
        ]);
        
        console.log('💾 Nueva caché generada correctamente.');
    }

    // Unificamos usando el masterMap
    const masterMap = unificarCuotas([
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData }
    ]);

    const coincidencias = [];
    const surebets = [];

    Object.keys(masterMap).forEach(key => {
        const m = masterMap[key];
        const casasQueLoTienen = Object.keys(m.detalles);
        
        // Coincidencia si el partido está en 2 o más casas cualesquiera
        if (casasQueLoTienen.length >= 2) {
            const arb = calcularDetalleArbitraje(...m.mejoresCuotas);
            
            const infoBase = {
                Partido: m.partido,
                Hora: m.hora,
                'Casas': casasQueLoTienen.join(' / '),
                'Mejores Cuotas': m.mejoresCuotas.join(' | '),
                'Fuentes': m.origen.join(' / ')
            };

            coincidencias.push(infoBase);

            if (arb.hayArbitraje) {
                surebets.push({ 
                    ...infoBase, 
                    ROI: arb.roi + "%", 
                    Stakes: `1:${arb.stakes.local} X:${arb.stakes.empate} 2:${arb.stakes.visitante}` 
                });
            }
        }
    });

    console.log(`\n✅ Análisis finalizado.`);
    console.log(`📊 Partidos unificados: ${Object.keys(masterMap).length}`);
    console.log(`🤝 Coincidencias multicasa encontradas: ${coincidencias.length}`);

    if (coincidencias.length > 0) {
        console.log('\n--- 🤝 DETALLE DE COINCIDENCIAS (TODAS LAS COMBINACIONES) ---');
        console.table(coincidencias.sort((a, b) => a.Hora.localeCompare(b.Hora)));
    }

    if (surebets.length > 0) {
        console.log('\n--- 🔥 OPORTUNIDADES DE ARBITRAJE ---');
        console.table(surebets.sort((a, b) => parseFloat(b.ROI) - parseFloat(a.ROI)));
    } else {
        console.log('\n☹️ No se han encontrado Surebets actualmente.');
    }
}

scrapeArbitrageFootball().catch(console.error);