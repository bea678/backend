import db from './db.js';

const TOTAL_INVESTMENT = parseFloat(process.env.TOTAL_INVESTMENT) || 100;

export async function processAndSaveArbitrage(data) { 
    try {
        // --- LIMPIEZA: Borrar registros que NO sean de hoy ---
        // Compara solo la parte de la fecha (YYYY-MM-DD)
        const deleteQuery = `DELETE FROM arbitrage_opportunities WHERE DATE(commence_time) != CURDATE()`;
        await db.execute(deleteQuery);
        console.log("Cleaning up old records... Done.");
    } catch (err) {
        console.error("❌ Error cleaning old records:", err.message);
    }

    for (const event of data) { 
        const { home_team, away_team, bookmakers, commence_time, sport_title, sport_key } = event;
        if (!bookmakers || bookmakers.length < 2) continue;

        // Formatear fecha para MySQL (YYYY-MM-DD HH:MM:SS)
        const mysqlReadyTime = commence_time.replace('T', ' ').replace('Z', '');

        let bestHome = { price: 0, bookmaker: '' };
        let bestAway = { price: 0, bookmaker: '' };

        bookmakers.forEach(bookie => {
            const h2hMarket = bookie.markets.find(m => m.key === 'h2h');
            if (!h2hMarket) return;

            const homePrice = h2hMarket.outcomes.find(o => o.name === home_team)?.price;
            const awayPrice = h2hMarket.outcomes.find(o => o.name === away_team)?.price;

            if (homePrice > bestHome.price) {
                bestHome = { price: homePrice, bookmaker: bookie.title };
            }
            if (awayPrice > bestAway.price) {
                bestAway = { price: awayPrice, bookmaker: bookie.title };
            }
        });

        if (bestHome.price > 0 && bestAway.price > 0) {
            const totalProb = (1 / bestHome.price) + (1 / bestAway.price);
            
            if (totalProb < 1) {
                const profitPct = (1 - totalProb) * 100;
                const netProfit = ((TOTAL_INVESTMENT / totalProb) - TOTAL_INVESTMENT).toFixed(2);

                const query = `INSERT INTO arbitrage_opportunities 
                    (sport_key, sport_title, home_team, away_team, commence_time, best_home_price, home_bookmaker, best_away_price, away_bookmaker, total_probability, profit_percentage, net_profit) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                try {
                    await db.execute(query, [
                        sport_key, 
                        sport_title, 
                        home_team, 
                        away_team, 
                        mysqlReadyTime, 
                        bestHome.price, 
                        bestHome.bookmaker, 
                        bestAway.price, 
                        bestAway.bookmaker,
                        totalProb, 
                        profitPct.toFixed(2), 
                        netProfit
                    ]);
                } catch (err) {
                    console.error("❌ Error inserting into MySQL:", err.message);
                }
            }
        }
    }
    console.log("✅ Analysis complete and saved to MySQL.");
}