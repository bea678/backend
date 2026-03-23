import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { processAndSaveArbitrage } from './analyzer2.js';
import db from './db.js';
import { parseQueryParams } from './query.js';
import { PORT } from './config.js';

const app = express();

const API_KEY = process.env.API_KEY;
app.use(express.json());

app.get('/refresh_data', async (req, res) => {
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

        processAndSaveArbitrage(oddsData);
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

        processAndSaveArbitrage(oddsData);
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
    // 1. Parseamos los parámetros originales
    const { query: parsedQuery, pager, sort } = parseQueryParams(req.query);
    
    // 2. EXTRAEMOS user_id de parsedQuery para que no entre al WHERE
    // Usamos desestructuración: 'user_id' se guarda aparte y 'restOfFilters' contiene todo lo demás
    const { user_id, ...restOfFilters } = parsedQuery;

    try {
        let params = [];
        let selectFields = `ao.*`;
        let joinClause = ``;

        // 3. Si hay user_id (extraído del objeto query), preparamos el JOIN
        if (user_id && user_id !== 'undefined') {
            selectFields += `, IF(ub.id IS NOT NULL, true, false) AS isUserIn`;
            joinClause = ` LEFT JOIN user_bets ub ON ao.id = ub.opportunity_id AND ub.user_id = ?`;
            params.push(Number(user_id)); // Primer '?'
        } else {
            selectFields += `, false AS isUserIn`;
        }

        let sql = `SELECT ${selectFields} FROM arbitrage_opportunities ao${joinClause}`;

        // 4. Construimos las condiciones usando SOLO restOfFilters (sin user_id)
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

        // 5. Orden y Paginación
        const safeSortField = sort.field.replace(/[^a-zA-Z0-9_]/g, '');
        sql += ` ORDER BY ao.${safeSortField} ${sort.direction} LIMIT ? OFFSET ?`;
        params.push(Number(pager.limit), Number(pager.offset));

        // LOGS para confirmar
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

app.get('/holabea', async (req, res) => {
    res.json('holabea');
})

app.listen(PORT, () => {
    console.log("Hora actual del Servidor:", new Date().toISOString());
    console.log(`🚀 Server running`);
});