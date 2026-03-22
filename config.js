export const PORT = process.env.PORT || 8080;

export const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Pituca1900*',
    database: process.env.DB_NAME || 'bearbitrage',
    timezone: 'Z',
    port: process.env.DB_PORT || 3306
};
