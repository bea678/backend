import cron from 'node-cron';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { sendPushNotification } from '../generalFunctions.js';
import { getUserById } from '../generalFunctions.js';

let sessionCookie = 'PHPSESSID=b6bd15cb890d52fd3c884e70c55b8763';

export async function consultarHive5(idABuscar) {
    const url = 'https://app.hive5.com/investment/primary/?page=1';

    const formData = new URLSearchParams();
    formData.append('interest-from', '');
    formData.append('interest-to', '');
    formData.append('originator', '');
    formData.append('period-from', '');
    formData.append('period-to', '35'); 
    formData.append('amount-left-from', '');
    formData.append('amount-left-to', '');
    formData.append('type', '');
    formData.append('clearFilter', 'false');
    formData.append('page', '1');
    formData.append('orderBy[]', '');
    formData.append('amount-left-invest', '10');

    try {
        console.log(`\n--- 🔍 INICIANDO CONEXIÓN A HIVE5 ---`);
        console.log(`🌐 URL: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'es-ES,es;q=0.9',
                'cache-control': 'no-cache',
                'content-type': 'application/x-www-form-urlencoded',
                'cookie': sessionCookie,
                'origin': 'https://app.hive5.com',
                'referer': 'https://app.hive5.com/investment/primary/?page=1',
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin'
            },
            body: formData
        });

        console.log(`📡 Status Code: ${response.status} (${response.statusText})`);
        
        if (!response.ok) {
            console.error(`🔴 ERROR: El servidor respondió con un error. ¿Ha caducado la Cookie?`);
            return null;
        }

        const html = await response.text();


        const tamanoKB = (html.length / 1024).toFixed(2);
        console.log(`📄 Datos recibidos: ${tamanoKB} KB`);

        if (html.includes('registration-block') || html.includes('name="login"') || html.length < 5000) {
            const user = await getUserById(1);

            console.error(`⚠️ ALERTA: La sesión ha caducado. El servidor envió la página de Login en lugar de los préstamos.`);

            let newSession = await loginHive5();
            sessionCookie = newSession;
            console.log('new Cookie is: ', sessionCookie)

            consultarHive5('loansForInvestment');
        }

        const $ = cheerio.load(html);
        const elemento = $(`#${idABuscar}`);

        if (elemento.length > 0) {
            const contenido = elemento.text().trim();
            console.log(`✅ ÉXITO: Elemento #${idABuscar} localizado.`);
            return contenido;
        } else {
            console.log(`⚠️ ID NO ENCONTRADO: La conexión fue exitosa pero el ID #${idABuscar} no está en el HTML.`);            
            return null;
        }

    } catch (error) {
        console.error('🔴 ERROR:', error.message);
        return null;
    }
}

export const executeCronHive = async () => {
    cron.schedule('*/10 7-22 * * *', async () => {
        const user = await getUserById(1);
        console.log('--- Ejecutando consulta programada a Hive5 (cada 10 min) ---');

        try {
            const data = await consultarHive5('loansForInvestment');
            if (data && data.length > 0) {
                if (user && user.pushToken) {
                    await sendPushNotification(
                        user.pushToken,
                        "Hive5: ¡Nueva Oportunidad!",
                        `Hay préstamos nuevos para inversión.`,
                    );
                }
                console.log('✅ Notificación enviada con éxito');
            } else {
                console.log('ℹ️ Consulta realizada: No hay novedades relevantes.');
            }

        } catch (error) {
            console.error('❌ Error en el ciclo del Cron:', error.message);
        }
    });
}

async function loginHive5() {
    const loginUrl = 'https://app.hive5.com/register/login/';

    const params = new URLSearchParams();
    params.append('login', process.env.HIVE5_EMAIL);
    params.append('password', process.env.HIVE5_PASSWORD);

    try {
        console.log("🔐 Intentando login en Hive5...");
        const response = await axios.post(loginUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });

        const cookies = response.headers['set-cookie'];
        if (cookies) {
            const phpSession = cookies.find(c => c.startsWith('PHPSESSID'));
            if (phpSession) {
                sessionCookie = phpSession.split(';')[0];
                console.log("✅ Nueva Cookie obtenida:", sessionCookie);
                return sessionCookie;
            }
        }
        throw new Error("No se encontró la cookie en la respuesta de login");
    } catch (error) {
        console.error("❌ Error en el login:", error.message);
        return null;
    }
}