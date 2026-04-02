export function generarIdUnico(home, away, hora) {
    const normalizar = (str) => {
        if (!str) return "";
        return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") 
            // 1. Normalizar filiales: "ii", "2" y "segundo equipo" a "b"
            .replace(/\b(ii|2|sports|reserva|res)\b/g, 'b') 
            // 2. Eliminar marcas de femenino para que "F/Chelsea" y "Chelsea Femenino" coincidan
            .replace(/\b(f|w|femenino|femenina|women|lfc)\b/g, '')
            // 3. Eliminar términos comunes de clubes
            .replace(/fc|sd|ud|cd|united|real|club|deportivo|atletico|atl\.|de|el|la|the|deportiva/g, '')
            // 4. Eliminar países/regiones comunes en nombres
            .replace(/\(espana\)|\bespana\b|\besp\b/g, '')
            // 5. Limpieza final de caracteres no alfanuméricos
            .replace(/[^a-z0-9]/g, '') 
            .trim();
    };

    const h = normalizar(home);
    const a = normalizar(away);
    
    // Ordenamos alfabéticamente para que "A vs B" sea igual a "B vs A"
    const equipos = [h, a].sort().join('_');

    // --- GESTIÓN DE HORA FLEXIBLE ---
    // Extraemos solo números (ej: "18:02" -> 1802)
    let horaLimpia = hora.replace(/[^0-9]/g, '').slice(-4);
    
    if (horaLimpia.length === 4) {
        let horas = parseInt(horaLimpia.substring(0, 2));
        let minutos = parseInt(horaLimpia.substring(2, 4));

        // Redondeamos los minutos a la decena más cercana (0, 10, 20...)
        // Esto hace que 17:59 y 18:00 se conviertan ambos en "1800"
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