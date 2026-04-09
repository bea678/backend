import { scrapeBetfairFootball } from "./betfair/football.js";
import { scrapeLeoVegasFootball } from "./leovegas/football.js";
import { scrapeLuckiaFootball } from "./luckia/football.js";
import { scrapeTonyBetFootball } from "./tonybet/football.js";
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { scrapeWinamaxFootball } from "./winamax/football.js";
import { scrapeBetfairBasketball } from "./betfair/basketball.js";
import { scrapeLuckiaBasketball } from "./luckia/basketball.js";
import { scrapeTonybetBasketball } from "./tonybet/basketball.js";
import { scrapeWinamaxBasketball } from "./winamax/basketball.js";
import { scrapeLeovegasBasketball } from "./leovegas/basketball.js";
import { unificarCuotas } from "./bearbitrage/scrape.js";
import { calcularDetalleArbitraje } from "./bearbitrage/scrape.js";
import { scrapeBetfairTennis } from "./betfair/tennis.js";
import { scrapeLuckiaTennis } from "./luckia/tennis.js";
import { scrapeLeovegasTenis } from "./leovegas/tennis.js";
import { scrapeTonybetTennis } from "./tonybet/tennis.js";
import { scrapeWinamaxTennis } from "./winamax/tennis.js";
import { scrapeBetfairIceHockey } from "./betfair/icehockey.js";
import { scrapeLuckiaIceHockey } from "./luckia/icehockey.js";
import { scrapeLeoVegasIceHockey } from "./leovegas/icehockey.js";
import { scrapeTonyBetIceHockey } from "./tonybet/icehockey.js";
import { scrapeWinamaxIceHockey } from "./winamax/icehockey.js";
import { getUserById, sendPushNotification } from "./generalFunctions.js";
import { scrapeBwinFootball } from "./bwin/football.js";
import { scrapeBwinBasketball } from "./bwin/basketball.js";
import { scrapeBwinTennis } from "./bwin/tennis.js";
import { scrapeBwinHockey } from "./bwin/icehockey.js";

puppeteer.use(StealthPlugin());

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

    // 3. LeoVegas
    let lvData = {};
    try {
        console.log('Empiezo con LeoVegas...')
        lvData = await scrapeLeoVegasFootball();
        console.log(`   ✅ LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ Error en LeoVegas:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    let tonyData = {};
    try {
        console.log('Empiezo con TonyBet...')
        tonyData = await scrapeTonyBetFootball();
        console.log(`   ✅ TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ Error en TonyBet:", e.message); }

    // 5. Winimax
    let winiData = {};
    try {
        console.log('Empiezo con Winimax...')
        winiData = await scrapeWinamaxFootball();
        console.log(`   ✅ Winimax finalizado (${Object.keys(winiData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Winimax:", e.message); }

    // 6. Bwin
    let bwinData = {};
    try {
        console.log('Empiezo con Bwin...')
        bwinData = await scrapeBwinFootball();
        console.log(`   ✅ Bwin finalizado (${Object.keys(bwinData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Bwin:", e.message); }

    const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData },
        { nombre: 'WM', data: winiData },
        { nombre: 'BW', data: bwinData }
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
        await sendPushNotification(user.pushToken, "Radar Fútbol Finalizado", `BF: ${Object.keys(bfData).length} LC: ${Object.keys(lcData).length} LV: ${Object.keys(lvData).length} TB: ${Object.keys(tonyData).length}. BW: ${Object.keys(bwinData).length}.
        Coincidencias: ${coincidencias.length}
        .    Subrets:  ${surebets.length}`);
    }
}

export async function scrapeArbitrageBasketball() {
    console.log('\n--- 🚀 INICIANDO RADAR MULTICASA (MODO LIMPIEZA PROFUNDA) ---');

    const pausar = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Betfair
    let bfData = {};
    try {
        bfData = await scrapeBetfairBasketball();
        console.log(`   ✅ Betfair basket finalizado (${Object.keys(bfData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Betfair:", e.message); }

    //2. Luckia
    let lcData = {};
    try {
        lcData = await scrapeLuckiaBasketball();
        console.log(`   ✅ Luckia finalizado (${Object.keys(lcData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Luckia:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 3. LeoVegas
    let lvData = {};
    try {
        console.log('Empiezo con LeoVegas...')
        lvData = await scrapeLeovegasBasketball();
        console.log(`   ✅ LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ Error en LeoVegas:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    let tonyData = {};
    try {
        console.log('Empiezo con TonyBet...')
        tonyData = await scrapeTonybetBasketball();
        console.log(`   ✅ TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ Error en TonyBet:", e.message); }

    // 5. Winimax
    let winiData = {};
    try {
        console.log('Empiezo con Winimax...')
        winiData = await scrapeWinamaxBasketball();
        console.log(`   ✅ TonyBet finalizado (${Object.keys(winiData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Winimax:", e.message); }

    // 6. Bwin
    let bwinData = {};
    try {
        console.log('Empiezo con Bwin...')
        bwinData = await scrapeBwinBasketball();
        console.log(`   ✅ Bwin finalizado (${Object.keys(bwinData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Bwin:", e.message); }

    console.log('⏱️ Esperando 10 segundos para liberar el túnel de Betfair...');
    await pausar(10000);

    const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData },
        { nombre: 'WM', data: winiData },
        { nombre: 'BW', data: bwinData }
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

    console.log(`\n✅ Radar Basket completado. Unificados: ${Object.keys(masterMap).length} | Coincidencias: ${coincidencias.length}`);

    if (surebets.length > 0) console.table(surebets);

    const user = await getUserById(1);
    if (user?.pushToken) {
        await sendPushNotification(user.pushToken, "Radar Baloncesto Finalizado", `BF: ${Object.keys(bfData).length} LC: ${Object.keys(lcData).length} LV: ${Object.keys(lvData).length} TB: ${Object.keys(tonyData).length}.      Coincidencias: ${coincidencias.length}
        .    Subrets:  ${surebets.length}`);
    }
}

export async function scrapeArbitrageTennis() {
    console.log('\n--- 🚀 INICIANDO RADAR MULTICASA (MODO LIMPIEZA PROFUNDA) ---');

    const pausar = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Betfair
    let bfData = {};
    try {
        bfData = await scrapeBetfairTennis();
        console.log(`   ✅ Betfair tenis finalizado (${Object.keys(bfData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Betfair:", e.message); }

    //2. Luckia
    let lcData = {};
    try {
        lcData = await scrapeLuckiaTennis();
        console.log(`   ✅ Luckia finalizado (${Object.keys(lcData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Luckia:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 3. LeoVegas
    let lvData = {};
    try {
        console.log('Empiezo con LeoVegas...')
        lvData = await scrapeLeovegasTenis();
        console.log(`   ✅ LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ Error en LeoVegas:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    let tonyData = {};
    try {
        console.log('Empiezo con TonyBet...')
        tonyData = await scrapeTonybetTennis();
        console.log(`   ✅ TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ Error en TonyBet:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 5. Winimax
    let winiData = {};
    try {
        console.log('Empiezo con Winimax...')
        winiData = await scrapeWinamaxTennis();
        console.log(`   ✅ TonyBet finalizado (${Object.keys(winiData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Winimax:", e.message); }

    // 6. Bwin
    let bwinData = {};
    try {
        console.log('Empiezo con Bwin...')
        bwinData = await scrapeBwinTennis();
        console.log(`   ✅ Bwin finalizado (${Object.keys(bwinData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Bwin:", e.message); }

    console.log('⏱️ Esperando 10 segundos para liberar el túnel de Betfair...');
    await pausar(10000);

    const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData },
        { nombre: 'WM', data: winiData },
        { nombre: 'BW', data: bwinData }
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

    console.log(`\n✅ Radar Basket completado. Unificados: ${Object.keys(masterMap).length} | Coincidencias: ${coincidencias.length}`);

    if (surebets.length > 0) console.table(surebets);

    const user = await getUserById(1);
    if (user?.pushToken) {
        await sendPushNotification(user.pushToken, "Radar Tenis Finalizado", `BF: ${Object.keys(bfData).length} LC: ${Object.keys(lcData).length} LV: ${Object.keys(lvData).length} TB: ${Object.keys(tonyData).length}.         Coincidencias: ${coincidencias.length}
        .    Subrets:  ${surebets.length}`);
    }
}

export async function scrapeArbitrageIceHockey() {
    console.log('\n--- 🚀 INICIANDO RADAR MULTICASA (MODO LIMPIEZA PROFUNDA) ---');

    const pausar = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Betfair
    let bfData = {};
    try {
        bfData = await scrapeBetfairIceHockey();
        console.log(`   ✅ Betfair ice hockey finalizado (${Object.keys(bfData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Betfair:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    //2. Luckia
    let lcData = {};
    try {
        lcData = await scrapeLuckiaIceHockey();
        console.log(`   ✅ Luckia finalizado (${Object.keys(lcData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Luckia:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 3. LeoVegas
    let lvData = {};
    try {
        console.log('Empiezo con LeoVegas...')
        lvData = await scrapeLeoVegasIceHockey();
        console.log(`   ✅ LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ Error en LeoVegas:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    let tonyData = {};
    try {
        console.log('Empiezo con TonyBet...')
        tonyData = await scrapeTonyBetIceHockey();
        console.log(`   ✅ TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ Error en TonyBet:", e.message); }

    console.log('⏱️ Esperando 8 segundos...');
    await pausar(8000);

    // 5. Winimax
    let winiData = {};
    try {
        console.log('Empiezo con Winimax...')
        winiData = await scrapeWinamaxIceHockey();
        console.log(`   ✅ TonyBet finalizado (${Object.keys(winiData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Winimax:", e.message); }

    console.log('⏱️ Esperando 10 segundos para liberar el túnel de Betfair...');
    await pausar(10000);

    // 6. Bwin
    let bwinData = {};
    try {
        console.log('Empiezo con Bwin...')
        bwinData = await scrapeBwinHockey();
        console.log(`   ✅ Bwin finalizado (${Object.keys(bwinData).length} partidos)`);
    } catch (e) { console.error("❌ Error en Bwin:", e.message); }

    const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData },
        { nombre: 'WM', data: winiData },
        { nombre: 'BW', data: bwinData }
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

    console.log(`\n✅ Radar Hockey sobre hielo completado. Unificados: ${Object.keys(masterMap).length} | Coincidencias: ${coincidencias.length}`);

    if (surebets.length > 0) console.table(surebets);

    const user = await getUserById(1);
    if (user?.pushToken) {
        await sendPushNotification(user.pushToken, "Radar Hockey sobre hielo Finalizado", `BF: ${Object.keys(bfData).length} LC: ${Object.keys(lcData).length} LV: ${Object.keys(lvData).length} TB: ${Object.keys(tonyData).length}.    
         Coincidencias: ${coincidencias.length}.    Subrets:  ${surebets.length}`);
    }
}