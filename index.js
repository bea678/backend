import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { processAndSaveArbitrage } from './analyzer2.js';
import db from './db.js';
import { parseQueryParams } from './query.js';
import { PORT } from './config.js';
import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeCronHive } from './hive5/hive5.js';
import bearMusicRoutes from './bearMusic/routes.js';
import { processAndSaveValueBets } from './bearbitrage/functions.js';
import cron from 'node-cron';
import { checkMobilePrice, executeCronMobile } from './checkMobilePrice.js';

const app = express();

const API_KEY = process.env.API_KEY;
const API_KEY_IO = process.env.API_KEY_IO;
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/public', express.static(path.join(__dirname, 'public')));

const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PROJECT_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

app.use(bearMusicRoutes);

app.use((req, res, next) => {
    const now = new Date().toLocaleTimeString();
    console.log(`[${now}] ${req.method} ${req.url}`);
    
    if (Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    
    next();
});

app.get('/refresh_data_io', async (req, res) => {
    const bookmakers = ['LeoVegas ES', 'Betfair ES'];

    try {
        console.log("Iniciando actualización de Value Bets (.io)...");

        const requests = bookmakers.map(bookie =>
            axios.get('https://api.odds-api.io/v3/value-bets', {
                params: {
                    apiKey: API_KEY_IO,
                    bookmaker: bookie,
                    includeEventDetails: true
                }
            })
        );

        const responses = await Promise.all(requests);
        const allValueBets = responses.flatMap(response => response.data);

        const todayStr = new Date().toISOString().split('T')[0];
        const betsToday = allValueBets.filter(bet => {
            return bet.event.date.split('T')[0] === todayStr;
        });

        betsToday.sort((a, b) => b.expectedValue - a.expectedValue);

        let savedCount = 0;
        if (betsToday.length > 0) {
            await processAndSaveValueBets(betsToday, 'odds-api.io');
            savedCount = betsToday.length;
        }

        res.json({
            status: "success",
            source: "odds-api.io",
            date_processed: todayStr,
            total_received: allValueBets.length,
            total_filtered_today: savedCount,
            allValueBets: allValueBets,
            message: savedCount > 0 ? "Datos actualizados correctamente" : "No se encontraron apuestas para hoy"
        });

    } catch (error) {
        console.error('❌ Error en refresh_data_io:', error.message);
        res.status(500).json({
            status: "error",
            message: error.message,
            details: error.response ? error.response.data : null
        });
    }
});

app.get('/refresh_data_com', async (req, res) => {
    try {
        const response = await axios.get(process.env.ODS_API, {
            params: {
                apiKey: API_KEY,
                regions: 'eu',
                markets: 'h2h',
                oddsFormat: 'decimal'
            }
        });
        let oddsData = response.data;

        processAndSaveArbitrage(oddsData, 'odds-api.com');
        res.json({ status: "success" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/fetch-odds', async (req, res) => {
    try {
        const response = await axios.get(process.env.ODS_API, {
            params: {
                apiKey: API_KEY,
                regions: 'eu',
                markets: 'h2h',
                oddsFormat: 'decimal'
            }
        });
        let oddsData = response.data;

        processAndSaveArbitrage(oddsData, 'odds-api.com');
        res.json({ status: "success", count: oddsData.length });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/create_bet', async (req, res) => {
    const {
        user_id,
        opportunity_id,
        total_investment,
        net_profit,
        roi_percentage,
        home_stake,
        away_stake
    } = req.body;

    if (!user_id || !opportunity_id || !total_investment) {
        return res.status(400).json({
            status: "error",
            message: "Faltan datos obligatorios (user_id, opportunity_id o inversión)."
        });
    }

    try {
        const sql = `
            INSERT INTO user_bets 
            (user_id, opportunity_id, total_investment, net_profit, roi_percentage, home_stake, away_stake, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
        `;

        const params = [
            user_id,
            opportunity_id,
            total_investment,
            net_profit,
            roi_percentage,
            home_stake,
            away_stake
        ];

        const [result] = await db.execute(sql, params);

        console.log(`✅ Apuesta guardada! ID: ${result.insertId} para el Usuario: ${user_id}`);

        res.json({
            status: "success",
            message: "Apuesta registrada correctamente",
            bet_id: result.insertId
        });

    } catch (error) {
        console.error("❌ Error al guardar la apuesta:", error.message);
        res.status(500).json({
            status: "error",
            message: "Error interno del servidor al guardar la apuesta."
        });
    }
});

app.get('/user_bets', async (req, res) => {
    const { query, pager, sort } = parseQueryParams(req.query);

    try {
        let sql = `
            SELECT 
                ub.*, 
                ao.home_team, 
                ao.away_team, 
                ao.sport_title, 
                ao.sport_key,
                ao.commence_time
            FROM user_bets ub
            JOIN arbitrage_opportunities ao ON ub.opportunity_id = ao.id
        `;

        let conditions = [];
        let params = [];

        Object.keys(query).forEach((key) => {
            const value = query[key];
            const prefix = ['home_team', 'away_team', 'sport_title'].includes(key) ? 'ao.' : 'ub.';
            const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '');

            if (value && typeof value === 'object' && value.$gt) {
                const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '');

                const dateObject = new Date(value.$gt);

                conditions.push(`${safeKey} > ?`);
                params.push(dateObject);
            } else if (typeof value === 'string') {
                conditions.push(`${prefix}${safeKey} LIKE ?`);
                params.push(`%${value}%`);
            } else {
                conditions.push(`${prefix}${safeKey} = ?`);
                params.push(value);
            }
        });

        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        const safeSortField = sort.field.replace(/[^a-zA-Z0-9_]/g, '') || 'created_at';
        const sortPrefix = ['home_team', 'sport_title'].includes(safeSortField) ? 'ao.' : 'ub.';
        sql += ` ORDER BY ${sortPrefix}${safeSortField} ${sort.direction}`;

        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(pager.limit), Number(pager.offset));

        console.log(`\x1b[36m%s\x1b[0m`, `  📈 SQL Historial: ${sql}`);

        const [rows] = await db.query(sql, params);

        res.json({
            status: "success",
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error("❌ Error en Historial:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/arbitrage_opportunities', async (req, res) => {
    const { query: parsedQuery, pager, sort } = parseQueryParams(req.query);
    const { user_id, ...restOfFilters } = parsedQuery;

    try {
        let params = [];
        let selectFields = `ao.*`;
        let joinClause = ``;

        if (user_id && user_id !== 'undefined') {
            selectFields += `, IF(ub.id IS NOT NULL, true, false) AS isUserIn`;
            joinClause = ` LEFT JOIN user_bets ub ON ao.id = ub.opportunity_id AND ub.user_id = ?`;
            params.push(Number(user_id));
        } else {
            selectFields += `, false AS isUserIn`;
        }

        let sql = `SELECT ${selectFields} FROM arbitrage_opportunities ao${joinClause}`;

        let conditions = [];
        Object.keys(restOfFilters).forEach((key) => {
            const value = restOfFilters[key];
            const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '');

            if (value && typeof value === 'object' && value.$gt) {
                conditions.push(`ao.${safeKey} > ?`);
                params.push(new Date(value.$gt));
            } else if (typeof value === 'string') {
                conditions.push(`ao.${safeKey} LIKE ?`);
                params.push(`%${value}%`);
            } else if (value !== undefined) {
                conditions.push(`ao.${safeKey} = ?`);
                params.push(value);
            }
        });

        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        const safeSortField = sort.field.replace(/[^a-zA-Z0-9_]/g, '');
        sql += ` ORDER BY ao.${safeSortField} ${sort.direction} LIMIT ? OFFSET ?`;
        params.push(Number(pager.limit), Number(pager.offset));

        console.log("🚀 SQL:", sql);
        console.log("📦 PARAMS:", params);

        const [rows] = await db.query(sql, params);

        res.json({
            status: "success",
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error("❌ Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/', async (req, res) => {
    res.json('holabea');
})

app.put('/update-token', async (req, res) => {
    const { userId, pushToken } = req.body;

    console.log('Solicitud de actualización - ID:', userId, 'Token:', pushToken?.substring(0, 10) + '...');

    if (!userId || !pushToken) {
        return res.status(400).json({ error: 'userId y pushToken son obligatorios' });
    }

    try {
        const query = `
            UPDATE users 
            SET pushToken = ? 
            WHERE id = ?
        `;

        const [result] = await db.execute(query, [pushToken, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'No se encontró el usuario con ese ID para actualizar.'
            });
        }

        console.log('✅ Base de datos actualizada correctamente');
        res.status(200).json({ success: true, message: 'Token actualizado' });

    } catch (error) {
        console.error('❌ Error SQL:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/youtube_credits', async (req, res) => {
    try {
        const query = 'SELECT resting_points FROM youtube_credits WHERE id = 1';
        const [rows] = await db.query(query);

        if (rows.length === 0) {
            return res.status(404).json({ 
                status: "error", 
                message: "No se encontró el registro de créditos." 
            });
        }

        res.json({ 
            status: "success", 
            resting_points: rows[0].resting_points 
        });

    } catch (error) {
        console.error("❌ Error al obtener los créditos:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.put('/youtube_credits', async (req, res) => {
    const { resting_points } = req.body;

    // Comprobamos que no sea undefined o null (pero permitimos que sea 0)
    if (resting_points === undefined || resting_points === null) {
        return res.status(400).json({ 
            status: "error", 
            message: "El campo resting_points es obligatorio en el body." 
        });
    }

    try {
        const query = 'UPDATE youtube_credits SET resting_points = ? WHERE id = 1';
        const [result] = await db.execute(query, [Number(resting_points)]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                status: "error", 
                message: "No se pudo actualizar. Fila no encontrada." 
            });
        }

        res.json({ 
            status: "success", 
            message: "Créditos actualizados correctamente",
            resting_points: Number(resting_points)
        });

    } catch (error) {
        console.error("❌ Error al actualizar los créditos:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
});

export const executeCronYoutubeCredits = async () => {
    cron.schedule('0 0 * * *', async () => {
        try {
            console.log('🔄 [CRON] Iniciando reseteo diario de créditos de YouTube...');
            
            const query = 'UPDATE youtube_credits SET resting_points = 90000 WHERE id = 1';
            const [result] = await db.execute(query);
            
            if (result.affectedRows > 0) {
                console.log('✅ [CRON] Créditos de YouTube recargados a 90000 exitosamente.');
            } else {
                console.warn('⚠️ [CRON] Cuidado: No se encontró la fila en youtube_credits.');
            }

        } catch (error) {
            console.error('❌ [CRON] Error al reiniciar los créditos de YouTube:', error.message);
        }
    }, {
        scheduled: true,
        timezone: "Europe/Madrid" 
    });
};

app.listen(PORT, () => {
    console.log("Hora actual del Servidor:", new Date().toISOString());
    console.log(`🚀 Server running en: `, PORT);

    executeCronHive()
    executeCronMobile()
    executeCronYoutubeCredits()
});