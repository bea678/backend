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
import { executeCronHive, consultarHive5 } from './hive5.js';

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

export async function processAndSaveValueBets(allValueBets, sourceApi) {
    try {
        const deleteQuery = `DELETE FROM arbitrage_opportunities WHERE DATE(commence_time) < CURDATE()`;
        await db.execute(deleteQuery);
    } catch (err) {
        console.error("❌ Error cleaning records:", err.message);
    }

    for (const bet of allValueBets) {
        const mysqlReadyTime = bet.event.date.replace('T', ' ').split('.')[0].replace('Z', '');

        let homePrice = 0, homeBookie = null;
        let awayPrice = 0, awayBookie = null;

        if (bet.betSide === 'home') {
            homePrice = parseFloat(bet.bookmakerOdds.home);
            homeBookie = bet.bookmaker;
        } else if (bet.betSide === 'away') {
            awayPrice = parseFloat(bet.bookmakerOdds.away);
            awayBookie = bet.bookmaker;
        } else if (bet.betSide === 'draw') {
            homePrice = parseFloat(bet.bookmakerOdds.draw);
            homeBookie = `${bet.bookmaker} (Draw)`;
        }

        const query = `INSERT INTO arbitrage_opportunities 
            (source_api, sport_key, sport_title, home_team, away_team, commence_time, 
             best_home_price, home_bookmaker, best_away_price, away_bookmaker, 
             total_probability, profit_percentage, net_profit) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        try {
            await db.execute(query, [
                sourceApi,
                bet.event.sport,
                bet.event.league,
                bet.event.home,
                bet.event.away,
                mysqlReadyTime,
                homePrice,
                homeBookie,
                awayPrice,
                awayBookie,
                0,
                bet.expectedValue,
                0
            ]);
        } catch (err) {
            console.error(`❌ Error inserting bet ${bet.id}:`, err.message);
        }
    }
    console.log(`✅ Proceso finalizado para ${sourceApi}.`);
}

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

/**
 * Función para enviar la notificación
 * @param {string} fcmToken - El token que obtuviste en React Native
 * @param {string} title - Título de la notificación
 * @param {string} body - Contenido del mensaje
 */
const sendPushNotification = async (fcmToken, title, body) => {
    const message = {
        notification: {
            title: title,
            body: body,
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'high_importance_channel',
                sound: 'default',
                priority: 'high',
                clickAction: 'fcm.ACTION_EVENT'
            },
        },
        data: {
            tipo: 'arbitraje_alert',
            id: '12345'
        },
        token: fcmToken,
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('✅ Mensaje enviado exitosamente:', response);
        return response;
    } catch (error) {
        console.error('❌ Error enviando el mensaje:', error);
        throw error;
    }
};
export const getUserById = async (id) => {
    try {
        const query = 'SELECT * FROM users WHERE id = ? LIMIT 1';
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            console.log(`⚠️ No se encontró el usuario con ID: ${id}`);
            return null;
        }

        return rows[0]; 
    } catch (error) {
        console.error('❌ Error al obtener usuario:', error.message);
        throw error;
    }
};

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

app.listen(PORT, () => {
    console.log("Hora actual del Servidor:", new Date().toISOString());
    console.log(`🚀 Server running en: `, PORT);

    executeCronHive()
    //consultarHive5('loansForInvestment');
});