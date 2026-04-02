import db from "../db.js";

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