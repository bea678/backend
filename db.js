import mysql from 'mysql2/promise';

const dbConfig = process.env.MYSQL_PUBLIC_URL 
    ? { uri: process.env.MYSQL_PUBLIC_URL } 
    : {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'mi_base_de_datos',
        port: process.env.DB_PORT || 3306
      };

const finalConfig = {
    ...dbConfig,
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}

const db = mysql.createPool(finalConfig);

const initTable = async () => {
    try {
        console.log("⏳ Intentando conectar a la base de datos...");
        const [rows] = await db.query('SELECT NOW() as currentTime, VERSION() as version');
        console.log("✅ ¡Conexión exitosa!");

        // 1. TABLA DE USUARIOS 
        const queryUsers = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                pushToken VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;

        // 2. TABLA DE OPORTUNIDADES
        const queryOpportunities = `
            CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
                id INT AUTO_INCREMENT PRIMARY KEY,
                source_api ENUM('odds-api.com', 'odds-api.io') NOT NULL,
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
        
        // 3. TABLA DE APUESTAS 
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
                CONSTRAINT fk_user
                    FOREIGN KEY (user_id) 
                    REFERENCES users(id)
                    ON DELETE CASCADE,
                CONSTRAINT fk_opportunity 
                    FOREIGN KEY (opportunity_id) 
                    REFERENCES arbitrage_opportunities(id)
                    ON DELETE CASCADE
            )`;

        await db.execute(queryUsers);
        console.log("👤 Tabla 'users' lista.");

        await db.execute(queryOpportunities);
        console.log("🗄️ Tabla 'arbitrage_opportunities' lista.");
        
        await db.execute(queryUserBets);
        console.log("📈 Tabla 'user_bets' lista para seguimiento.");

    } catch (err) {
        console.error("❌ Error de MySQL:", err.message);
    }
};

initTable();

export default db;