import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { processAndSaveArbitrage } from './analyzer2.js';
import db from './db.js';
import { parseQueryParams } from './query.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8080;

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
        let oddsData;

        const response = await axios.get(process.env.ODS_API, {
            params: {
                apiKey: API_KEY,
                regions: 'eu',
                markets: 'h2h',
                oddsFormat: 'decimal'
            }
        });
        oddsData = response.data;

        processAndSaveArbitrage(oddsData);
        res.json({ status: "success", count: oddsData.length });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/create_bet', async (req, res) => {
    console.log('req.body: ', req.body);

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

        // Ordenación
        const safeSortField = sort.field.replace(/[^a-zA-Z0-9_]/g, '') || 'created_at';
        const sortPrefix = ['home_team', 'sport_title'].includes(safeSortField) ? 'ao.' : 'ub.';
        sql += ` ORDER BY ${sortPrefix}${safeSortField} ${sort.direction}`;

        // Paginación
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
    const { query, pager, sort } = parseQueryParams(req.query);

    try {
        let sql = `SELECT * FROM arbitrage_opportunities`;
        let conditions = [];
        let params = [];

        Object.keys(query).forEach((key) => {
            const value = query[key];
            const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '');

            if (value && typeof value === 'object' && value.$gt) {
                console.log('value.$gt: ', value.$gt)
                const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '');

                const dateLimit = new Date(value.$gt);

                conditions.push(`${safeKey} > ?`);

                params.push(dateLimit);
            } else if (typeof value === 'string') {
                conditions.push(`${safeKey} LIKE ?`);
                params.push(`%${value}%`);
            } else {
                conditions.push(`${safeKey} = ?`);
                params.push(value);
            }
        });

        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        const safeSortField = sort.field.replace(/[^a-zA-Z0-9_]/g, '');
        sql += ` ORDER BY arbitrage_opportunities.${safeSortField} ${sort.direction}`;

        sql += ` LIMIT ? OFFSET ?`;
        params.push(Number(pager.limit), Number(pager.offset));

        console.log(`\x1b[33m%s\x1b[0m`, `  🔍 SQL Generado: ${sql}`);
        console.log(`  📦 Parámetros:`, params);

        const [rows] = await db.query(sql, params);

        console.log(`  ✅ Resultados encontrados: ${rows.length}`);

        res.json({
            status: "success",
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error("❌ Error en el servidor:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.listen(PORT, () => {
    console.log("Hora actual del Servidor:", new Date().toISOString());
    console.log(`🚀 Server running at http://localhost:${PORT}/fetch-odds`);
});