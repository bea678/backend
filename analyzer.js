const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'data_prueba.json');
const OUTPUT_FILE = path.join(__dirname, 'oportunidades_arbitraje.txt');
const INVERSION_TOTAL = 100; 

function analizarArbitraje() {
    if (!fs.existsSync(FILE_PATH)) {
        console.log("❌ No se encuentra el archivo data_prueba.json. Ejecuta primero el servidor.");
        return;
    }

    const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    console.log(`🧐 Analizando ${data.length} eventos...`);
    
    const logStream = fs.createWriteStream(OUTPUT_FILE, { flags: 'w' });
    let encontrados = 0;

    logStream.write(`REPORTE DE ARBITRAJE - ${new Date().toLocaleString()}\n`);
    logStream.write(`==================================================\n\n`);

    data.forEach(evento => {
        // Extraemos sport_title (nombre amigable) y sport_key (ID técnico)
        const { home_team, away_team, bookmakers, commence_time, sport_title, sport_key } = evento;
        
        if (bookmakers.length < 2) return;

        let mejorCuotaLocal = { cuota: 0, casa: '' };
        let mejorCuotaVisitante = { cuota: 0, casa: '' };

        bookmakers.forEach(bookie => {
            const mercadoH2H = bookie.markets.find(m => m.key === 'h2h');
            if (!mercadoH2H) return;

            const cuotaLocal = mercadoH2H.outcomes.find(o => o.name === home_team)?.price;
            const cuotaVisitante = mercadoH2H.outcomes.find(o => o.name === away_team)?.price;

            if (cuotaLocal > mejorCuotaLocal.cuota) {
                mejorCuotaLocal = { cuota: cuotaLocal, casa: bookie.title };
            }
            if (cuotaVisitante > mejorCuotaVisitante.cuota) {
                mejorCuotaVisitante = { cuota: cuotaVisitante, casa: bookie.title };
            }
        });

        if (mejorCuotaLocal.cuota > 0 && mejorCuotaVisitante.cuota > 0) {
            const probabilidadTotal = (1 / mejorCuotaLocal.cuota) + (1 / mejorCuotaVisitante.cuota);
            
            if (probabilidadTotal < 1) {
                encontrados++;
                const beneficioPorcentaje = (1 - probabilidadTotal) * 100;
                const apuestaLocal = (INVERSION_TOTAL / (mejorCuotaLocal.cuota * probabilidadTotal));
                const apuestaVisitante = (INVERSION_TOTAL / (mejorCuotaVisitante.cuota * probabilidadTotal));
                const retornoCualquierCaso = (apuestaLocal * mejorCuotaLocal.cuota).toFixed(2);
                const gananciaLimpia = (retornoCualquierCaso - INVERSION_TOTAL).toFixed(2);

                const fechaPartido = new Date(commence_time).toLocaleString('es-ES', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });

                const bloque = 
                    `==================================================
                    ✅ ¡ARBITRAJE! [${beneficioPorcentaje.toFixed(2)}% de beneficio]
                    🏆 Deporte: ${sport_title}
                    🔑 Sport Key: ${sport_key}
                    📅 Fecha: ${fechaPartido}
                    ⚽ Evento: ${home_team} vs ${away_team}
                    --------------------------------------------------
                    🏠 Apostar ${apuestaLocal.toFixed(2)}€ a ${home_team} (${mejorCuotaLocal.cuota}) en ${mejorCuotaLocal.casa}
                    🚀 Apostar ${apuestaVisitante.toFixed(2)}€ a ${away_team} (${mejorCuotaVisitante.cuota}) en ${mejorCuotaVisitante.casa}
                    --------------------------------------------------
                    💰 Si gana cualquiera, cobras: ${retornoCualquierCaso}€
                    💵 GANANCIA NETA: +${gananciaLimpia}€
                    ==================================================\n\n`;

                console.log(bloque);
                logStream.write(bloque);
            }
        }
    });

    if (encontrados === 0) {
        const msg = "Nada por ahora. Las casas están bien equilibradas.";
        console.log(msg);
        logStream.write(msg);
    } else {
        console.log(`\n📂 Se han guardado ${encontrados} oportunidades en: ${OUTPUT_FILE}`);
    }
    logStream.end();
}

analizarArbitraje();