import { scrapeBetfairFootball } from "./betfair/betfairScrapping.js";
import { getUserById } from "./generalFunctions.js";
import { scrapeLeoVegasFootball } from "./leovegas/leovegasScrapping.js";
import { scrapeLuckiaFootball } from "./luckia/luckiaScraping.js";
import { scrapeTonyBetFootball } from "./tonybet/tonybetScrapping.js";
import fs from 'fs/promises';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { sendPushNotification } from "./generalFunctions.js";

puppeteer.use(StealthPlugin());

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

export async function scrapeArbitrageFootball() {
    console.log('\n--- 🚀 INICIANDO RADAR MULTICASA (MODO LIMPIEZA PROFUNDA) ---');

    const pausar = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Betfair (Es el más pesado, lo dejamos para el final o le damos mucha pausa después)
    let bfData = {};
    try {
        bfData = await scrapeBetfairFootball();
        console.log(`   ✅ Betfair finalizado (${Object.keys(bfData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Betfair:", e.message); }
    
    console.log('⏱️ Esperando 10 segundos para liberar el túnel de Betfair...');
    await pausar(10000); 

    //2. Luckia
    let lcData = {};
    try {
        lcData = await scrapeLuckiaFootball();
        console.log(`   ✅ Luckia finalizado (${Object.keys(lcData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Luckia:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 1. LeoVegas
    let lvData = {};
    try {
        console.log('Empiezo con LeoVegas...')
        lvData = await scrapeLeoVegasFootball();
        console.log(`   ✅ LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ Error en LeoVegas:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    /*let tonyData = {};
    try {
        console.log('Empiezo con TonyBet...')
        tonyData = await scrapeTonyBetFootball();
        console.log(`   ✅ TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ Error en TonyBet:", e.message); }*/

    // --- PROCESAMIENTO FINAL ---
    /*const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData }
    ];

    const masterMap = unificarCuotas(fuentes);

    const surebets = [];
    const coincidencias = [];

    Object.keys(masterMap).forEach(key => {
        const m = masterMap[key];
        if (Object.keys(m.detalles).length >= 2) {
            const arb = calcularDetalleArbitraje(...m.mejoresCuotas);
            const info = { Partido: m.partido, Hora: m.hora, Casas: Object.keys(m.detalles).join('/') };
            coincidencias.push(info);
            if (arb.hayArbitraje) surebets.push({ ...info, ROI: arb.roi + "%" });
        }
    });

    console.log(`\n✅ Radar completado. Unificados: ${Object.keys(masterMap).length} | Coincidencias: ${coincidencias.length}`);
    
    if (surebets.length > 0) console.table(surebets);

    // Notificación
    const user = await getUserById(1);
    if (user?.pushToken) {
        await sendPushNotification(user.pushToken, "Radar Finalizado", `BF:${Object.keys(bfData).length} LC:${Object.keys(lcData).length} LV:${Object.keys(lvData).length} TB:${Object.keys(tonyData).length}`);
    }*/
}