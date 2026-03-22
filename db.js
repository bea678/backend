import mysql from 'mysql2/promise';

console.log("--- DEBUG DE ENTORNO ---");
console.log("DB_HOST existe?", !!process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("------------------------");

const dbUri = process.env.MYSQL_PUBLIC_URL;

const dbConfig = {
    uri: dbUri,
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}

const db = mysql.createPool(dbConfig);

const initTable = async () => {
    try {
        // --- PRUEBA DE CONEXIÓN ---
        console.log("⏳ Intentando conectar a la base de datos...");
        const [rows] = await db.query('SELECT NOW() as currentTime, VERSION() as version');
        console.log("✅ ¡Conexión exitosa!");
        console.log(`📡 Servidor: ${process.env.MYSQLHOST || 'localhost'}`);
        console.log(`⏱️ Hora del servidor DB: ${rows[0].currentTime}`);
        console.log(`🆔 Versión MySQL: ${rows[0].version}`);
        // --------------------------

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
        
        const queryUserBets = `
            CREATE TABLE IF NOT EXISTS user_bets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                opportunity_id INT NOT NULL,
                total_investment DOUBLE NOT NULL,
                net_profit DOUBLE NOT NULL,
                roi_percentage DOUBLE,
                home_stake DOUBLE NOT NULL,
                away_stake DOUBLE NOT NULL,
                status ENUM('pending', 'completed', 'canceled') DEFAULT 'completed',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_opportunity 
                    FOREIGN KEY (opportunity_id) 
                    REFERENCES arbitrage_opportunities(id)
                    ON DELETE CASCADE
            )`;

        await db.execute(queryOpportunities);
        console.log("🗄️ Tabla 'arbitrage_opportunities' lista.");
        
        await db.execute(queryUserBets);
        console.log("📈 Tabla 'user_bets' lista para seguimiento.");

    } catch (err) {
        console.log('err: ', err)
        console.log('API_KEY: ', process.env.API_KEY)
        console.log('MYSQL_URL: ', process.env.MYSQL_PUBLIC_URL)
        console.log('dbConfig is: ', dbConfig)
        console.error("❌ Error de MySQL:");
        console.error(`> Mensaje: ${err.message}`);
        console.error(`> Código: ${err.code}`); 
    }
};

initTable();

export default db;