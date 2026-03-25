import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { processAndSaveArbitrage } from './analyzer2.js';
import db from './db.js';
import { parseQueryParams } from './query.js';
import { PORT } from './config.js';
import fs from 'fs/promises';

const app = express();

const API_KEY = process.env.API_KEY;
const API_KEY_IO = process.env.API_KEY_IO;
app.use(express.json());

const sports_io = [
    "football",
    /*  "basketball",
      "tennis",
      "baseball",
      "american-football",
      "ice-hockey",
      "esports",
      "darts",
      "mixed-martial-arts",
      "boxing",
      "handball",
      "volleyball",
      "snooker",
      "table-tennis",
      "rugby",
      "cricket",
      "water-polo",
      "futsal",
      "beach-volleyball",
      "aussie-rules",
      "floorball",
      "squash",
      "beach-soccer",
      "lacrosse",
      "curling",
      "padel",
      "bandy",
      "gaelic-football",
      "beach-handball",
      "athletics",
      "badminton",
      "cross-country",
      "golf",
      "cycling"*/
];

const todaysEventsIDS =
    [
        69977698,
        69904544,
        69904546,
        69289742,
        67698010,
        69279056,
        69110562,
        70066288,
        70212214,
        65931778,
        69796798,
        66755224,
        70184412,
        70152818,
        66711994,
        66712018,
        66712172,
        66711896,
        70224578,
        70211600,
        69248932,
        69024366,
        69852468,
        61939050,
        61939056,
        62041340,
        62041836,
        62041842,
        62041846,
        62041850,
        62042372,
        62042376,
        62042384,
        62042898,
        66711970,
        66711982,
        66708686,
        66708718,
        66708732,
        66711910,
        70224624,
        70184414,
        70209578,
        69572182,
        69165474,
        69165622,
        69165608,
        69165640,
        69165724,
        68536290,
        70065836,
        69796800,
        70224632,
        69165630,
        69165666,
        70006684,
        70006686,
        70006690,
        69165822,
        61939706,
        61939708,
        61939712,
        61939720,
        62041344,
        62041348,
        62041352,
        62042896,
        62042902,
        62042904,
        66711954,
        66712020,
        66708748,
        69024368,
        70007792,
        69594254,
        69420100,
        69931120,
        70181242,
        70181348,
        69951918,
        69503852,
        69503854,
        69503856,
        66711956,
        66711968,
        66712080,
        70231600,
        66711922,
        69585058,
        69100500,
        69593920,
        69165606,
        69165664,
        69165726,
        66708734,
        69734518,
        69165642,
        69593718,
        61939048,
        61939052,
        61939722,
        68681934,
        66711942,
        66711944,
        67790346,
        66711898,
        70025582,
        70231708,
        70245174,
        69249438,
        70006688,
        70006692,
        67962774,
        69593948,
        68385436,
        69293368,
        68936642,
        66711980,
        66711996,
        66708720,
        66708750,
        66711908,
        70109172,
        69277778,
        69310292,
        69165624,
        69165748,
        69165738,
        69255278,
        70230982,
        70129020,
        70129078,
        70129080,
        70129082,
        67207494,
        69880364,
        70230984,
        70230986,
        70230988,
        70072088,
        66708684,
        66711920,
        69734524,
        70230990,
        69834324,
        69961346,
        69980160,
        67516624,
        69125466,
        69165632,
        69165736,
        68385438,
        61541276,
        62103522,
        69116086,
        69125468,
        69221460,
        68533626,
        69177244,
        61541266,
        61541268,
        61541274,
        61541278,
        69134102,
        69140800,
        69140806,
        70007212,
        69500084,
        66917684,
        66917688,
        66917696,
        67962776,
        68158506,
        68158508,
        68158510,
        68158520,
        68158524,
        68158526,
        69294716,
        69350542,
        69594126,
        66917690,
        69165472,
        67766528,
        66149854,
        67464474,
        69140992,
        69613634,
        69165820,
        68356016,
        70109182,
        66712078,
        70172648,
        62216334,
        66756622,
        70007220,
        69325202,
        69029884,
        67766172,
        70067204,
        70072086,
        69828050,
        69828052,
        69828054,
        70092254,
        68567708,
        61916096,
        61916098,
        61916100,
        61916102,
        61916104,
        61916106,
        68129058,
        68533624,
        69834326,
        69265482,
        67516622,
        69089240,
        69851662,
        69851664,
        69851666,
        69089242,
        70245176,
        70245178,
        69540540,
        69540548,
        70245180,
        67516388,
        69824122,
        67766174,
        67766176,
        67766530,
        67766178,
        69310356,
        70077404,
        67546216,
        69904548,
        69904550,
        68129062,
        66917694,
        69977700,
        67091844,
        69904552,
        69904554,
        69904556,
        69905306,
        69905338,
        69905308,
        66917686,
        69861228,
        67911956,
        67911958,
        68129060,
        67172424,
        70013108,
        69904698,
        66917682,
        66917692,
        69824148,
        67171856,
        69977702,
        69824124,
        67172426,
        69540566,
        69834328,
        69905340,
        69828056
    ]

const bookmakers = 'Betfair ES,LeoVegas ES';

app.get('/hola', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    //const todaysEventsIDS = [];
    const bets = [];

    try {
        //1. De cada deporte cogemos los eventos
        /* for (const sport of sports_io) {
             const response = await axios.get('https://api.odds-api.io/v3/events', {
                 params: {
                     apiKey: API_KEY_IO,
                     sport: sport
                 }
             });
 
             const events = response.data;
 
             events.forEach(event => {
                 const eventDate = event.date.split('T')[0];
 
                 if (eventDate === today) {
                     todaysEventsIDS.push(event.id);
                 }
             });
         }
 
         try {
             await fs.writeFile('eventos_hoy.json', JSON.stringify(todaysEventsIDS, null, 2));
 
             console.log('Fichero "eventos_hoy.json" guardado correctamente.');
         } catch (fileError) {
             console.error('Error al escribir el fichero:', fileError);
         }*/

        console.log(`Se han encontrado ${todaysEventsIDS.length} eventos para hoy.`);

        todaysEventsIDS.splice(0, 50);

        //2. De cada evento cogemos las apuestas
        for (const eventID of todaysEventsIDS) {
            try {
                const oddsResponse = await fetch(
                    `https://api.odds-api.io/v3/odds?apiKey=${API_KEY_IO}&eventId=${eventID}&bookmakers=${bookmakers}`
                );

                const data = await oddsResponse.json();

                /*      const oddsResponse = await axios.get('https://api.odds-api.io/v3/odds', {
                          params: {
                              apiKey: API_KEY_IO,
                              event: event.id,
                              bookmakers: bookmakers, 
                          }
                      });*/

                console.log('data: ', data)
                if (data) {
                    bets.push(data);
                }
            } catch (err) {
                console.error(`Error obteniendo cuotas para el evento ${eventID}:`, err.message);
                continue;
            }
        }

        await fs.writeFile('bets.json', JSON.stringify(bets, null, 2));

        console.log(`Proceso finalizado. Total de apuestas recolectadas: ${bets.length}`);

        res.json({
            success: true,
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
    console.log(`🚀 Server running en: `, PORT);
});