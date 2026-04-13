export function generarIdUnico(home, away, hora) {
    const normalizar = (str) => {
        if (!str) return "";
        return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") 
            .replace(/\b(ii|2|sports|reserva|res)\b/g, 'b') 
            .replace(/\b(f|w|femenino|femenina|women|lfc)\b/g, '')
            .replace(/fc|sd|ud|cd|united|real|club|deportivo|atletico|atl\.|de|el|la|the|deportiva/g, '')
            .replace(/\(espana\)|\bespana\b|\besp\b/g, '')
            .replace(/[^a-z0-9]/g, '') 
            .trim();
    };

    const h = normalizar(home);
    const a = normalizar(away);
    
    const equipos = [h, a].sort().join('_');

    let horaLimpia = hora.replace(/[^0-9]/g, '').slice(-4);
    
    if (horaLimpia.length === 4) {
        let horas = parseInt(horaLimpia.substring(0, 2));
        let minutos = parseInt(horaLimpia.substring(2, 4));

        let minutosRedondeados = Math.round(minutos / 10) * 10;
        
        if (minutosRedondeados === 60) {
            minutosRedondeados = 0;
            horas = (horas + 1) % 24;
        }

        horaLimpia = `${horas.toString().padStart(2, '0')}${minutosRedondeados.toString().padStart(2, '0')}`;
    }

    return `${horaLimpia}_${equipos}`;
}

export function obtenerHoraInicio(minutosParaEmpezar) {
    const ahora = new Date();
    const horaInicio = new Date(ahora.getTime() + (minutosParaEmpezar || 0) * 60000);
    return `${horaInicio.getHours().toString().padStart(2, '0')}:${horaInicio.getMinutes().toString().padStart(2, '0')}`;
}

export function unificarCuotas(fuentes) {
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

            p.cuotas?.forEach((cuota, i) => {
                if (cuota > master[key].mejoresCuotas[i]) {
                    master[key].mejoresCuotas[i] = cuota;
                    master[key].origen[i] = nombre;
                }
            });
        });
    });
    return master;
}

export function calcularDetalleArbitraje(q1, qX, q2, inversionTotal = 100, minRoi = 1.0) {
    if (!q1 || !qX || !q2) return { hayArbitraje: false };
    
    const prob = (1 / q1) + (1 / qX) + (1 / q2);
    
    if (prob >= 1.0) return { hayArbitraje: false };

    const roi = ((1 / prob) - 1) * 100;
    
    if (roi < minRoi) return { hayArbitraje: false };

    const beneficio = (inversionTotal / prob) - inversionTotal;

    const stake1 = inversionTotal / (q1 * prob);
    const stakeX = inversionTotal / (qX * prob);
    const stake2 = inversionTotal / (q2 * prob);

    return {
        hayArbitraje: true,
        roi: roi.toFixed(2),
        beneficio: beneficio.toFixed(2),
        inversionTotal: inversionTotal,
        stakesExactos: {
            local: stake1.toFixed(2),
            empate: stakeX.toFixed(2),
            visitante: stake2.toFixed(2)
        },
        stakesRedondeados: {
            local: Math.round(stake1),
            empate: Math.round(stakeX),
            visitante: Math.round(stake2)
        }
    };
}