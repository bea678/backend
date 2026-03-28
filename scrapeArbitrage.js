import { scrapeBetfairFootball } from "./betfairScrapping.js";
import { scrapeLeoVegasFootball } from "./leovegasScrapping.js";
import fs from 'fs/promises';

// --- 1. EXPORTACIONES PARA LOS SCRAPERS ---

export function obtenerHoraInicio(minutosParaEmpezar) {
    const ahora = new Date();
    const horaInicio = new Date(ahora.getTime() + (minutosParaEmpezar || 0) * 60000);
    return `${horaInicio.getHours().toString().padStart(2, '0')}:${horaInicio.getMinutes().toString().padStart(2, '0')}`;
}

export function generarIdUnico(home, away, hora) {
    const normalizar = (str) => (str || "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quita acentos
        .replace(/fc|sd|ud|cd|united|real|club|deportivo|atletico|atl\.|de|el|la|the/g, '')
        .replace(/[^a-z0-9]/g, '') // Solo letras y números
        .trim();

    const h = normalizar(home);
    const a = normalizar(away);
    const equipos = [h, a].sort().join('_');
    return `${hora.replace(':', '')}_${equipos}`;
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

// --- 2. LÓGICA DE UNIFICACIÓN ---

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
                    // Guardamos las cuotas originales de cada casa para la tabla de coincidencias
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

// --- 3. FUNCIÓN PRINCIPAL ---

export async function scrapeArbitrageFootball() {
    console.log('--- 🚀 INICIANDO RADAR MULTICASA ---');
    
    let bfData, lvData;
    try {
        console.log('📂 Intentando cargar caché...');
        bfData = JSON.parse(await fs.readFile('betfair_cache.json', 'utf-8'));
        lvData = JSON.parse(await fs.readFile('leovegas_cache.json', 'utf-8'));
        console.log('✅ Caché cargada.');
    } catch (e) {
        console.log('🌐 Caché no lista. Scrapeando...');
        [bfData, lvData] = await Promise.all([scrapeBetfairFootball(), scrapeLeoVegasFootball()]);
        await fs.writeFile('betfair_cache.json', JSON.stringify(bfData, null, 2));
        await fs.writeFile('leovegas_cache.json', JSON.stringify(lvData, null, 2));
    }

    const masterMap = unificarCuotas([
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData }
    ]);

    const coincidencias = [];
    const surebets = [];

    Object.keys(masterMap).forEach(key => {
        const m = masterMap[key];
        
        // Solo consideramos coincidencia si está en AMBAS casas (BF y LV)
        if (m.detalles.BF && m.detalles.LV) {
            const arb = calcularDetalleArbitraje(...m.mejoresCuotas);
            
            const infoBase = {
                Partido: m.partido,
                Hora: m.hora,
                'Cuotas BF': m.detalles.BF.join(' | '),
                'Cuotas LV': m.detalles.LV.join(' | '),
                'Mejores': m.mejoresCuotas.join(' | ')
            };

            coincidencias.push(infoBase);
            if (arb.hayArbitraje) {
                surebets.push({ ...infoBase, ROI: arb.roi + "%", Stakes: `1:${arb.stakes.local} X:${arb.stakes.empate} 2:${arb.stakes.visitante}` });
            }
        }
    });

    console.log(`\n✅ Partidos analizados en total: ${Object.keys(masterMap).length}`);
    console.log(`🤝 Coincidencias encontradas entre BF y LV: ${coincidencias.length}`);

    if (coincidencias.length > 0) {
        console.log('\n--- 🤝 DETALLE DE COINCIDENCIAS (TODAS) ---');
        console.table(coincidencias);
    }

    if (surebets.length > 0) {
        console.log('\n--- 🔥 OPORTUNIDADES DE ARBITRAJE ---');
        console.table(surebets.sort((a, b) => parseFloat(b.ROI) - parseFloat(a.ROI)));
    } else {
        console.log('\n☹️ No se han encontrado Surebets con beneficio hoy.');
    }
}

scrapeArbitrageFootball().catch(console.error);