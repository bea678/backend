import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import { getUserById, sendPushNotification } from './generalFunctions.js';

export async function checkMobilePrice() {
    const url = 'https://store.google.com/es/product/pixel_9a?hl=es';
    const headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
    };

    try {
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        const textoPrecio = $('[data-test="price"]').text().trim(); 
        const coincidencia = textoPrecio.match(/\d+/);
        const precio = coincidencia ? Number(coincidencia[0]) : null;
        return precio;
    } catch (error) {
        console.error('❌ Error en el scraper:', error.message);
        return {};
    }
}

function numerosEnNegrita(texto) {
    const mapa = {
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', 
        '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵',
        '.': '.', ',': ',' // Dejamos puntos y comas igual
    };
    return texto.toString().split('').map(char => mapa[char] || char).join('');
}

export const executeCronMobile = async () => {
    cron.schedule('0 9 * * *', async () => {
        const user = await getUserById(1);
        console.log('--- Ejecutando consulta Google Pixel ---');

        try {
            const price = await checkMobilePrice();

            if (price) {
                if (user && user.pushToken) {
                    let byMonth = (price / 12).toFixed(2);

                    const priceStrong = numerosEnNegrita(price);
                    const monthStrong = numerosEnNegrita(byMonth);

                    await sendPushNotification(
                        user.pushToken,
                        "Precio Google Pixel 9a",
                        `Total ${priceStrong}€${"        "}${monthStrong} €/mes`,
                        'ic_notification_purchase'
                    );
                }
                console.log('✅ Notificación enviada con éxito');
            } else {
                console.log('ℹ️ Consulta realizada: No hay novedades relevantes.');
            }

        } catch (error) {
            console.error('❌ Error en el ciclo del Cron:', error.message);
        }
    }, {
        scheduled: true,
        timezone: "Europe/Madrid"
    });
}
