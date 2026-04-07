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

console.log('🔧 Inicializando Puppeteer StealthPlugin...');
puppeteer.use(StealthPlugin());

export async function scrapeArbitrageFootball() {
    console.log('\n================================================================');
    console.log('⚽ --- 🚀 INICIANDO RADAR MULTICASA FÚTBOL (MODO LIMPIEZA PROFUNDA) ---');
    console.log('================================================================\n');

    const pausar = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Betfair
    let bfData = {};
    try {
        console.log('⏳ [FÚTBOL] Ejecutando scrapeBetfairFootball()...');
        bfData = await scrapeBetfairFootball();
        console.log(`   ✅ [FÚTBOL] Betfair finalizado (${Object.keys(bfData).length} partidos)`);
    } catch (e) { console.error("❌ [FÚTBOL] Error en Betfair:", e.message); }

    console.log('⏱️ [FÚTBOL] Esperando 10 segundos para liberar el túnel de Betfair...');
    await pausar(10000);

    //2. Luckia
    let lcData = {};
    try {
        console.log('⏳ [FÚTBOL] Ejecutando scrapeLuckiaFootball()...');
        lcData = await scrapeLuckiaFootball();
        console.log(`   ✅ [FÚTBOL] Luckia finalizado (${Object.keys(lcData).length} partidos)`);
    } catch (e) { console.error("❌ [FÚTBOL] Error en Luckia:", e.message); }

    console.log('⏱️ [FÚTBOL] Esperando 8 segundos...');
    await pausar(8000);

    // 3. LeoVegas
    let lvData = {};
    try {
        console.log('⏳ [FÚTBOL] Ejecutando scrapeLeoVegasFootball()...');
        lvData = await scrapeLeoVegasFootball();
        console.log(`   ✅ [FÚTBOL] LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ [FÚTBOL] Error en LeoVegas:", e.message); }

    console.log('⏱️ [FÚTBOL] Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    let tonyData = {};
    try {
        console.log('⏳ [FÚTBOL] Ejecutando scrapeTonyBetFootball()...');
        tonyData = await scrapeTonyBetFootball();
        console.log(`   ✅ [FÚTBOL] TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ [FÚTBOL] Error en TonyBet:", e.message); }

    // 5. Winimax
    let winiData = {};
    try {
        console.log('⏳ [FÚTBOL] Ejecutando scrapeWinamaxFootball()...');
        winiData = await scrapeWinamaxFootball();
        console.log(`   ✅ [FÚTBOL] Winimax finalizado (${Object.keys(winiData).length} partidos)`);
    } catch (e) { console.error("❌ [FÚTBOL] Error en Winimax:", e.message); }

    console.log('\n📊 [FÚTBOL] Agrupando fuentes de datos...');
    const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData },
        { nombre: 'WM', data: winiData }
    ];

    console.log('🔀 [FÚTBOL] Unificando cuotas en MasterMap...');
    const masterMap = unificarCuotas(fuentes);

    const surebets = [];
    const coincidencias = [];

    console.log('🔍 [FÚTBOL] Analizando MasterMap en busca de arbitrajes...');
    Object.keys(masterMap).forEach(key => {
        const m = masterMap[key];
        if (Object.keys(m.detalles).length >= 2) {
            const arb = calcularDetalleArbitraje(...m.mejoresCuotas);
            const info = { Partido: m.partido, Hora: m.hora, Casas: Object.keys(m.detalles).join('/') };
            coincidencias.push(info);
            if (arb.hayArbitraje) {
                console.log(`   🤑 [FÚTBOL] ¡Surebet encontrada! ${m.partido} - ROI: ${arb.roi}%`);
                surebets.push({ ...info, ROI: arb.roi + "%" });
            }
        }
    });

    console.log(`\n✅ [FÚTBOL] Radar completado. Unificados: ${Object.keys(masterMap).length} | Coincidencias: ${coincidencias.length}`);

    if (surebets.length > 0) {
        console.log('📋 [FÚTBOL] Tabla de Surebets detectadas:');
        console.table(surebets);
    } else {
        console.log('📉 [FÚTBOL] No se encontraron surebets en esta pasada.');
    }

    // Notificación
    console.log('🔔 [FÚTBOL] Buscando usuario para enviar Push Notification...');
    const user = await getUserById(1);
    if (user?.pushToken) {
        console.log(`📱 [FÚTBOL] Enviando Push Notification al token: ${user.pushToken.substring(0, 10)}...`);
        await sendPushNotification(user.pushToken, "Radar Fútbol Finalizado", `BF: ${Object.keys(bfData).length} LC: ${Object.keys(lcData).length} LV: ${Object.keys(lvData).length} TB: ${Object.keys(tonyData).length}.       Coincidencias: ${coincidencias.length}
        .    Subrets:  ${surebets.length}`);
        console.log('✅ [FÚTBOL] Push Notification enviada con éxito.');
    } else {
        console.log('⚠️ [FÚTBOL] No se encontró el usuario o no tiene pushToken configurado.');
    }
}

export async function scrapeArbitrageBasketball() {
    console.log('\n================================================================');
    console.log('🏀 --- 🚀 INICIANDO RADAR MULTICASA BALONCESTO (MODO LIMPIEZA PROFUNDA) ---');
    console.log('================================================================\n');

    const pausar = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Betfair
    let bfData = {};
    try {
        console.log('⏳ [BASKET] Ejecutando scrapeBetfairBasketball()...');
        bfData = await scrapeBetfairBasketball();
        console.log(`   ✅ [BASKET] Betfair finalizado (${Object.keys(bfData).length} partidos)`);
    } catch (e) { console.error("❌ [BASKET] Error en Betfair:", e.message); }

    //2. Luckia
    let lcData = {};
    try {
        console.log('⏳ [BASKET] Ejecutando scrapeLuckiaBasketball()...');
        lcData = await scrapeLuckiaBasketball();
        console.log(`   ✅ [BASKET] Luckia finalizado (${Object.keys(lcData).length} partidos)`);
    } catch (e) { console.error("❌ [BASKET] Error en Luckia:", e.message); }

    console.log('⏱️ [BASKET] Esperando 8 segundos...');
    await pausar(8000);

    // 3. LeoVegas
    let lvData = {};
    try {
        console.log('⏳ [BASKET] Ejecutando scrapeLeovegasBasketball()...');
        lvData = await scrapeLeovegasBasketball();
        console.log(`   ✅ [BASKET] LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ [BASKET] Error en LeoVegas:", e.message); }

    console.log('⏱️ [BASKET] Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    let tonyData = {};
    try {
        console.log('⏳ [BASKET] Ejecutando scrapeTonybetBasketball()...');
        tonyData = await scrapeTonybetBasketball();
        console.log(`   ✅ [BASKET] TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ [BASKET] Error en TonyBet:", e.message); }

    // 5. Winimax
    let winiData = {};
    try {
        console.log('⏳ [BASKET] Ejecutando scrapeWinamaxBasketball()...');
        winiData = await scrapeWinamaxBasketball();
        console.log(`   ✅ [BASKET] Winimax finalizado (${Object.keys(winiData).length} partidos)`);
    } catch (e) { console.error("❌ [BASKET] Error en Winimax:", e.message); }

    console.log('⏱️ [BASKET] Esperando 10 segundos para liberar el túnel de Betfair...');
    await pausar(10000);

    console.log('\n📊 [BASKET] Agrupando fuentes de datos...');
    const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData },
        { nombre: 'WM', data: winiData }
    ];

    console.log('🔀 [BASKET] Unificando cuotas en MasterMap...');
    const masterMap = unificarCuotas(fuentes);

    const surebets = [];
    const coincidencias = [];

    console.log('🔍 [BASKET] Analizando MasterMap en busca de arbitrajes...');
    Object.keys(masterMap).forEach(key => {
        const m = masterMap[key];
        if (Object.keys(m.detalles).length >= 2) {
            const arb = calcularDetalleArbitraje(...m.mejoresCuotas);
            const info = { Partido: m.partido, Hora: m.hora, Casas: Object.keys(m.detalles).join('/') };
            coincidencias.push(info);
            if (arb.hayArbitraje) {
                console.log(`   🤑 [BASKET] ¡Surebet encontrada! ${m.partido} - ROI: ${arb.roi}%`);
                surebets.push({ ...info, ROI: arb.roi + "%" });
            }
        }
    });

    console.log(`\n✅ [BASKET] Radar completado. Unificados: ${Object.keys(masterMap).length} | Coincidencias: ${coincidencias.length}`);

    if (surebets.length > 0) {
        console.log('📋 [BASKET] Tabla de Surebets detectadas:');
        console.table(surebets);
    } else {
        console.log('📉 [BASKET] No se encontraron surebets en esta pasada.');
    }

    console.log('🔔 [BASKET] Buscando usuario para enviar Push Notification...');
    const user = await getUserById(1);
    if (user?.pushToken) {
        console.log(`📱 [BASKET] Enviando Push...`);
        await sendPushNotification(user.pushToken, "Radar Baloncesto Finalizado", `BF: ${Object.keys(bfData).length} LC: ${Object.keys(lcData).length} LV: ${Object.keys(lvData).length} TB: ${Object.keys(tonyData).length}.      Coincidencias: ${coincidencias.length}
        .    Subrets:  ${surebets.length}`);
        console.log('✅ [BASKET] Push enviada.');
    }
}

export async function scrapeArbitrageTennis() {
    console.log('\n================================================================');
    console.log('🎾 --- 🚀 INICIANDO RADAR MULTICASA TENIS (MODO LIMPIEZA PROFUNDA) ---');
    console.log('================================================================\n');

    const pausar = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Betfair
    let bfData = {};
    try {
        console.log('⏳ [TENIS] Ejecutando scrapeBetfairTennis()...');
        bfData = await scrapeBetfairTennis();
        console.log(`   ✅ [TENIS] Betfair finalizado (${Object.keys(bfData).length} partidos)`);
    } catch (e) { console.error("❌ [TENIS] Error en Betfair:", e.message); }

    //2. Luckia
    let lcData = {};
    try {
        console.log('⏳ [TENIS] Ejecutando scrapeLuckiaTennis()...');
        lcData = await scrapeLuckiaTennis();
        console.log(`   ✅ [TENIS] Luckia finalizado (${Object.keys(lcData).length} partidos)`);
    } catch (e) { console.error("❌ [TENIS] Error en Luckia:", e.message); }

    console.log('⏱️ [TENIS] Esperando 8 segundos...');
    await pausar(8000);

    // 3. LeoVegas
    let lvData = {};
    try {
        console.log('⏳ [TENIS] Ejecutando scrapeLeovegasTenis()...');
        lvData = await scrapeLeovegasTenis();
        console.log(`   ✅ [TENIS] LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ [TENIS] Error en LeoVegas:", e.message); }

    console.log('⏱️ [TENIS] Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    let tonyData = {};
    try {
        console.log('⏳ [TENIS] Ejecutando scrapeTonybetTennis()...');
        tonyData = await scrapeTonybetTennis();
        console.log(`   ✅ [TENIS] TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ [TENIS] Error en TonyBet:", e.message); }

    console.log('⏱️ [TENIS] Esperando 8 segundos...');
    await pausar(8000);

    // 5. Winimax
    let winiData = {};
    try {
        console.log('⏳ [TENIS] Ejecutando scrapeWinamaxTennis()...');
        winiData = await scrapeWinamaxTennis();
        console.log(`   ✅ [TENIS] Winimax finalizado (${Object.keys(winiData).length} partidos)`);
    } catch (e) { console.error("❌ [TENIS] Error en Winimax:", e.message); }

    console.log('⏱️ [TENIS] Esperando 10 segundos para liberar el túnel de Betfair...');
    await pausar(10000);

    console.log('\n📊 [TENIS] Agrupando fuentes de datos...');
    const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData },
        { nombre: 'WM', data: winiData }
    ];

    console.log('🔀 [TENIS] Unificando cuotas en MasterMap...');
    const masterMap = unificarCuotas(fuentes);

    const surebets = [];
    const coincidencias = [];

    console.log('🔍 [TENIS] Analizando MasterMap en busca de arbitrajes...');
    Object.keys(masterMap).forEach(key => {
        const m = masterMap[key];
        if (Object.keys(m.detalles).length >= 2) {
            const arb = calcularDetalleArbitraje(...m.mejoresCuotas);
            const info = { Partido: m.partido, Hora: m.hora, Casas: Object.keys(m.detalles).join('/') };
            coincidencias.push(info);
            if (arb.hayArbitraje) {
                console.log(`   🤑 [TENIS] ¡Surebet encontrada! ${m.partido} - ROI: ${arb.roi}%`);
                surebets.push({ ...info, ROI: arb.roi + "%" });
            }
        }
    });

    console.log(`\n✅ [TENIS] Radar completado. Unificados: ${Object.keys(masterMap).length} | Coincidencias: ${coincidencias.length}`);

    if (surebets.length > 0) {
        console.table(surebets);
    } else {
        console.log('📉 [TENIS] No se encontraron surebets.');
    }

    console.log('🔔 [TENIS] Buscando usuario para enviar Push Notification...');
    const user = await getUserById(1);
    if (user?.pushToken) {
        await sendPushNotification(user.pushToken, "Radar Tenis Finalizado", `BF: ${Object.keys(bfData).length} LC: ${Object.keys(lcData).length} LV: ${Object.keys(lvData).length} TB: ${Object.keys(tonyData).length}.         Coincidencias: ${coincidencias.length}
        .    Subrets:  ${surebets.length}`);
        console.log('✅ [TENIS] Push enviada.');
    }
}

export async function scrapeArbitrageIceHockey() {
    console.log('\n================================================================');
    console.log('🏒 --- 🚀 INICIANDO RADAR MULTICASA HOCKEY HIELO (MODO LIMPIEZA PROFUNDA) ---');
    console.log('================================================================\n');

    const pausar = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Betfair
    let bfData = {};
    try {
        console.log('⏳ [HOCKEY] Ejecutando scrapeBetfairIceHockey()...');
        bfData = await scrapeBetfairIceHockey();
        console.log(`   ✅ [HOCKEY] Betfair finalizado (${Object.keys(bfData).length} partidos)`);
    } catch (e) { console.error("❌ [HOCKEY] Error en Betfair:", e.message); }

    console.log('⏱️ [HOCKEY] Esperando 8 segundos...');
    await pausar(8000);

    //2. Luckia
    let lcData = {};
    try {
        console.log('⏳ [HOCKEY] Ejecutando scrapeLuckiaIceHockey()...');
        lcData = await scrapeLuckiaIceHockey();
        console.log(`   ✅ [HOCKEY] Luckia finalizado (${Object.keys(lcData).length} partidos)`);
    } catch (e) { console.error("❌ [HOCKEY] Error en Luckia:", e.message); }

    console.log('⏱️ [HOCKEY] Esperando 8 segundos...');
    await pausar(8000);

    // 3. LeoVegas
    let lvData = {};
    try {
        console.log('⏳ [HOCKEY] Ejecutando scrapeLeoVegasIceHockey()...');
        lvData = await scrapeLeoVegasIceHockey();
        console.log(`   ✅ [HOCKEY] LeoVegas finalizado (${Object.keys(lvData).length} partidos)`);
    } catch (e) { console.error("❌ [HOCKEY] Error en LeoVegas:", e.message); }

    console.log('⏱️ [HOCKEY] Esperando 8 segundos...');
    await pausar(8000);

    // 4. TonyBet
    let tonyData = {};
    try {
        console.log('⏳ [HOCKEY] Ejecutando scrapeTonyBetIceHockey()...');
        tonyData = await scrapeTonyBetIceHockey();
        console.log(`   ✅ [HOCKEY] TonyBet finalizado (${Object.keys(tonyData).length} partidos)`);
    } catch (e) { console.error("❌ [HOCKEY] Error en TonyBet:", e.message); }

    console.log('⏱️ [HOCKEY] Esperando 8 segundos...');
    await pausar(8000);

    // 5. Winimax
    let winiData = {};
    try {
        console.log('⏳ [HOCKEY] Ejecutando scrapeWinamaxIceHockey()...');
        winiData = await scrapeWinamaxIceHockey();
        console.log(`   ✅ [HOCKEY] Winimax finalizado (${Object.keys(winiData).length} partidos)`);
    } catch (e) { console.error("❌ [HOCKEY] Error en Winimax:", e.message); }

    console.log('⏱️ [HOCKEY] Esperando 10 segundos para liberar el túnel de Betfair...');
    await pausar(10000);

    console.log('\n📊 [HOCKEY] Agrupando fuentes de datos...');
    const fuentes = [
        { nombre: 'BF', data: bfData },
        { nombre: 'LV', data: lvData },
        { nombre: 'LC', data: lcData },
        { nombre: 'TB', data: tonyData },
        { nombre: 'WM', data: winiData }
    ];

    console.log('🔀 [HOCKEY] Unificando cuotas en MasterMap...');
    const masterMap = unificarCuotas(fuentes);

    const surebets = [];
    const coincidencias = [];

    console.log('🔍 [HOCKEY] Analizando MasterMap en busca de arbitrajes...');
    Object.keys(masterMap).forEach(key => {
        const m = masterMap[key];
        if (Object.keys(m.detalles).length >= 2) {
            const arb = calcularDetalleArbitraje(...m.mejoresCuotas);
            const info = { Partido: m.partido, Hora: m.hora, Casas: Object.keys(m.detalles).join('/') };
            coincidencias.push(info);
            if (arb.hayArbitraje) {
                console.log(`   🤑 [HOCKEY] ¡Surebet encontrada! ${m.partido} - ROI: ${arb.roi}%`);
                surebets.push({ ...info, ROI: arb.roi + "%" });
            }
        }
    });

    console.log(`\n✅ [HOCKEY] Radar completado. Unificados: ${Object.keys(masterMap).length} | Coincidencias: ${coincidencias.length}`);

    if (surebets.length > 0) {
        console.table(surebets);
    } else {
        console.log('📉 [HOCKEY] No se encontraron surebets.');
    }

    console.log('🔔 [HOCKEY] Buscando usuario para enviar Push Notification...');
    const user = await getUserById(1);
    if (user?.pushToken) {
        await sendPushNotification(user.pushToken, "Radar Hockey sobre hielo Finalizado", `BF: ${Object.keys(bfData).length} LC: ${Object.keys(lcData).length} LV: ${Object.keys(lvData).length} TB: ${Object.keys(tonyData).length}.    
         Coincidencias: ${coincidencias.length}.    Subrets:  ${surebets.length}`);
        console.log('✅ [HOCKEY] Push enviada.');
    }
}