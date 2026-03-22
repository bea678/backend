// parseQueryParams.js
export function parseQueryParams(q) {
    let query = {};
    let pager = { limit: 20000, offset: 0 };
    let sort = { field: 'created_at', direction: 'DESC' };

    try {
        // --- 1. Reconstruir Filtros ---
        const queryKeys = Object.keys(q).filter(key => key.startsWith('query['));
        const grouped = {};
        
        queryKeys.forEach(key => {
            const match = key.match(/query\[(\d+)\]\[(\w+)\]/);
            if (match) {
                const [_, index, field] = match;
                if (!grouped[index]) grouped[index] = {};
                grouped[index][field] = q[key];
            }
        });

        Object.values(grouped).forEach(item => {
            if (item.name) {
                let val = item.value;
                // Detectar si el valor es un objeto JSON (ej: para el $gt de la fecha)
                if (typeof val === 'string' && val.startsWith('{')) {
                    try { val = JSON.parse(val); } catch (e) { /* se queda como string */ }
                }
                // Convertir tipos básicos
                if (val === 'true') val = true;
                if (val === 'false') val = false;
                if (!isNaN(val) && val !== '' && typeof val !== 'boolean' && typeof val !== 'object') {
                    val = Number(val);
                }
                query[item.name] = val;
            }
        });

        // --- 2. Paginación (Forzar Números) ---
        pager.limit = parseInt(q['pager[limit]']) || 20000;
        pager.offset = parseInt(q['pager[offset]']) || 0;

        // --- 3. Ordenación ---
        const sField = q['sort[field]'];
        if (sField && sField !== 'undefined' && sField !== '') {
            sort.field = sField;
            sort.direction = (q['sort[desc]'] === 'true' || q['sort[desc]'] === '-1') ? 'DESC' : 'ASC';
        }

    } catch (error) {
        console.error("❌ Error en parseQueryParams:", error);
    }

    return { query, pager, sort };
}