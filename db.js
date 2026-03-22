import mysql from 'mysql2/promise';

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: 'Z'
};

const db = mysql.createPool(dbConfig);

const initTable = async () => {
    try {
        // 1. Tabla de Oportunidades (El mercado actual)
        const queryOpportunities = `
            CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sport_key VARCHAR(255),
                sport_title VARCHAR(255),
                home_team VARCHAR(255),
                away_team VARCHAR(255),
                commence_time DATETIME,
                best_home_price DOUBLE,
                home_bookmaker VARCHAR(255),
                best_away_price DOUBLE,
                away_bookmaker VARCHAR(255),
                total_probability DOUBLE,
                profit_percentage DOUBLE,
                net_profit DOUBLE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
        
        // 2. Tabla de Apuestas Realizadas (Tu historial de éxito)
        const queryUserBets = `
            CREATE TABLE IF NOT EXISTS user_bets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                opportunity_id INT NOT NULL,
                
                -- Datos financieros de la operación
                total_investment DOUBLE NOT NULL,
                net_profit DOUBLE NOT NULL,
                roi_percentage DOUBLE,
                
                -- Desglose de ejecución (lo que Bea puso en cada casa)
                home_stake DOUBLE NOT NULL,
                away_stake DOUBLE NOT NULL,
                
                -- Estado y Auditoría
                status ENUM('pending', 'completed', 'canceled') DEFAULT 'completed',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                
                -- Relación con la tabla de oportunidades
                CONSTRAINT fk_opportunity 
                    FOREIGN KEY (opportunity_id) 
                    REFERENCES arbitrage_opportunities(id)
                    ON DELETE CASCADE
            )`;

        await db.execute(queryOpportunities);
        console.log("🗄️ Table 'arbitrage_opportunities' ready.");
        
        await db.execute(queryUserBets);
        console.log("📈 Table 'user_bets' ready for tracking.");

    } catch (err) {
        console.error("❌ MySQL Init Error:", err.message);
    }
};

initTable();

export default db;