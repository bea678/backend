import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getUserById, sendPushNotification } from "../generalFunctions.js";
import cron from 'node-cron';
import * as OTPAuth from 'otpauth';

puppeteer.use(StealthPlugin());
let lastBetterItems = [];
let lastShortTermItemId = null; 

const MACLEAR_EMAIL = process.env.MACLEAR_EMAIL;
const MACLEAR_PASSWORD = process.env.MACLEAR_PASSWORD;
const MACLEAR_SECRET_2FA = process.env.MACLEAR_SECRET_2FA;

export async function fetchMaclearBetterDiscount() {
    console.log('🚀 Iniciando navegador MACLEAR en el servidor...');

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    const user = await getUserById(1); 

    try {
        console.log('🛡️ Navegando a la raíz para establecer contexto y pasar Cloudflare...');
        
        await page.goto('https://app.maclear.ch/', {
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        console.log('✅ Contexto establecido. Generando 2FA...');

        const totp = new OTPAuth.TOTP({
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(MACLEAR_SECRET_2FA)
        });
        const currentCode2FA = totp.generate();

        console.log(`🔑 Código generado: ${currentCode2FA}. Iniciando login silencioso en la API...`);

        const apiData = await page.evaluate(async (email, password, code2fa) => {
            try {
                // --- LOGIN ---
                const loginResponse = await fetch('https://app.maclear.ch/api/v1/auth/login', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ username: email, password: password })
                });

                const loginJson = await loginResponse.json();
                if (loginJson.response.status !== 'success') return { error: 'Fallo en credenciales de login' };
                
                const tempToken = `Bearer ${loginJson.accessToken}`;

                // --- 2FA ---
                const twoFaResponse = await fetch('https://app.maclear.ch/api/user/validate-code-two-fa', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'authorization': tempToken,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ code: code2fa, type: "otp" })
                });

                const twoFaJson = await twoFaResponse.json();
                if (twoFaJson.response.status !== 'success') return { error: 'Fallo al validar el código 2FA' };

                const finalToken = `Bearer ${twoFaJson.accessToken}`;

                // --- QUERY 1: Mejor descuento (Existente) ---
               /* const marketResponse = await fetch('https://app.maclear.ch/api/v1/market/list', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'authorization': finalToken,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        "column": "discount",
                        "page": 1,
                        "per-page": 1500,
                        "typeSort": 3,
                        "priceTo": "500",
                    })
                });

                const marketRawText = await marketResponse.text();
                if (!marketResponse.ok) return { error: `HTTP ${marketResponse.status} en Query 1`, body: marketRawText };
                const marketData = JSON.parse(marketRawText);*/

                // --- QUERY 2: Menor tiempo restante (Nueva) ---
                const shortTermResponse = await fetch('https://app.maclear.ch/api/v1/market/list', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'authorization': finalToken,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        "column": "loanPeriodLeft",
                        "page": 1,
                        "per-page": 30,
                        "typeSort": 4
                    })
                });

                const shortTermRawText = await shortTermResponse.text();
                if (!shortTermResponse.ok) return { error: `HTTP ${shortTermResponse.status} en Query 2`, body: shortTermRawText };
                const shortTermData = JSON.parse(shortTermRawText);

                // Devolvemos ambos resultados
                return { 
                    //marketData: marketData, 
                    shortTermData: shortTermData 
                };

            } catch (err) {
                return { error: err.message };
            }
        }, MACLEAR_EMAIL, MACLEAR_PASSWORD, currentCode2FA); 

        // 3. Comprobamos si el bloque de evaluación devolvió algún error
        if (apiData.error !== undefined) {
            await sendPushNotification(
                user.pushToken,
                "Error en la API de Maclear",
                apiData.error,
                'ic_pie_chart'
            );
            console.error('❌ Error extraído de la API:', apiData.error);
            return;
        }

        const { shortTermData } = apiData;

        // -------------------------------------------------------------------------
        // 4A. Procesamos los datos de la QUERY 2 (Menor tiempo restante)
        // -------------------------------------------------------------------------
        if (shortTermData && shortTermData.length > 0) {
            const firstShortTermItem = shortTermData[0];
            
            //if (firstShortTermItem.project.loanPeriodLeft <=2) {
                await sendPushNotification(
                    user.pushToken,
                    `Duración Mínima: ${firstShortTermItem.project.loanPeriodLeft} meses`,
                    `Descuento: ${firstShortTermItem.discount}%\nPrecio: ${firstShortTermItem.price}€\nProyecto: ${firstShortTermItem.project.name}`,
                    'ic_pie_chart'
                );
                lastShortTermItemId = firstShortTermItem.id; // Actualizamos el id para no repetir
                console.log('🔔 Notificación enviada para el préstamo más corto.');
            //}

            console.log('Préstamo con menor tiempo encontrado: '+ firstShortTermItem.project.loanPeriodLeft + ' meses')
        } else {
            console.log('⚠️ La query de menor duración está vacía.');
        }


        // -------------------------------------------------------------------------
        // 4B. Procesamos los datos de la QUERY 1 (Mejor descuento / Lógica original)
        // -------------------------------------------------------------------------
        let newBetterItems = [];
        
       /* if (marketData && marketData.length > 0) {
            let remainingMonths = marketData[0].project.loanPeriodLeft;
            let discount = marketData[0].discount;
            let indexApiData = 1;
            let indexTotal = marketData.length;
            let item = marketData[0];

            newBetterItems.push({
                id: item.id,
                discount: item.discount,
                price: item.price,
                remainingMonths: item.project.loanPeriodLeft,
                projectName: item.project.name,
                projectId: item.project.id
            });

            while ((discount > 0) && (indexApiData < indexTotal)) {
                item = marketData[indexApiData];

                if ((item.project.loanPeriodLeft < remainingMonths) && (item.discount > 0)) {
                    newBetterItems.push({
                        id: item.id,
                        discount: item.discount,
                        price: item.price,
                        remainingMonths: item.project.loanPeriodLeft,
                        projectName: item.project.name,
                        projectId: item.project.id
                    });
                    remainingMonths = item.project.loanPeriodLeft;
                }

                discount = item.discount;
                indexApiData++;
            }
        } else {
            console.log('⚠️ El mercado secundario parece estar vacío (0 resultados en descuentos).');
        }*/

        console.log('Total en newBetterItems: ', newBetterItems.length);

        for (let i = 0; i < newBetterItems.length; i++) {
            const currentItem = newBetterItems[i]; 
            const itemYaExistia = lastBetterItems.some(oldItem => oldItem.id === currentItem.id);

            //TODO BEA AQUI
           // if (!itemYaExistia) {
                await sendPushNotification(
                    user.pushToken,
                    `Nuevo descuento para ${currentItem.remainingMonths} meses`,
                    `Descuento: ${currentItem.discount}%\nPrecio: ${currentItem.price}\nProyecto: ${currentItem.projectName}\nMeses restantes: ${currentItem.remainingMonths}`,
                    'ic_pie_chart'
                );
         //   }
        }

        lastBetterItems = newBetterItems;
        //console.log(`Se han procesado ${marketData ? marketData.length : 0} elementos del mercado por descuento.\n`);

    } catch (error) {
        console.error('❌ Error general durante la ejecución:', error);
    } finally {
        await browser.close();
        console.log('🚪 Navegador cerrado.');
    }
}

export const executeCronMaclear = () => {
    cron.schedule('*/10 8-23 * * *', async () => {
        try {
            await fetchMaclearBetterDiscount();
        } catch (error) {
            console.error('❌ Error en el ciclo del Cron:', error.message);
        }
    });
}