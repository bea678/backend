import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getUserById, sendPushNotification } from "../generalFunctions.js";
import cron from 'node-cron';
import * as OTPAuth from 'otpauth';

puppeteer.use(StealthPlugin());
let lastBetterItems = [];

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
        
        // Vamos a la raíz solo para que el navegador recoja las cookies iniciales (cf_clearance, etc)
        await page.goto('https://app.maclear.ch/', {
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        console.log('✅ Contexto establecido. Generando 2FA...');

        // 1. Generamos el código 2FA fresco justo en el milisegundo antes de usarlo
        const totp = new OTPAuth.TOTP({
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(MACLEAR_SECRET_2FA)
        });
        const currentCode2FA = totp.generate();

        console.log(`🔑 Código generado: ${currentCode2FA}. Iniciando login silencioso en la API...`);

        // 2. Inyectamos nuestras variables al navegador y hacemos la magia
        const apiData = await page.evaluate(async (email, password, code2fa) => {
            try {
                // PASO 1: Login inicial para sacar el token temporal
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

                // PASO 2: Mandamos el 2FA usando el token temporal
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

                // PASO 3: Ya tenemos acceso total. Pedimos los datos del mercado.
                const marketResponse = await fetch('https://app.maclear.ch/api/v1/market/list', {
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
                        "typeSort": 3
                    })
                });

                const marketRawText = await marketResponse.text();

                if (!marketResponse.ok) {
                    return { error: `HTTP ${marketResponse.status}`, body: marketRawText };
                }

                return JSON.parse(marketRawText);
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

        // 4. Si todo ha ido bien, procesamos los datos
        let newBetterItems = [];
        
        if (apiData && apiData.length > 0) {
            let remainingMonths = apiData[0].project.loanPeriodLeft;
            let discount = apiData[0].discount;
            let indexApiData = 1;
            let indexTotal = apiData.length;
            let item = apiData[0];

            newBetterItems.push({
                id: item.id,
                discount: item.discount,
                price: item.price,
                remainingMonths: item.project.loanPeriodLeft,
                projectName: item.project.name,
                projectId: item.project.id
            });

            while ((discount > 0) && (indexApiData < indexTotal)) {
                item = apiData[indexApiData];

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
            console.log('⚠️ El mercado secundario parece estar vacío (0 resultados).');
        }

        console.log('Total en newBetterItems: ', newBetterItems.length);

        for (let i = 0; i < newBetterItems.length; i++) {
            const currentItem = newBetterItems[i]; 
            const itemYaExistia = lastBetterItems.some(oldItem => oldItem.id === currentItem.id);

            if (!itemYaExistia) {
                await sendPushNotification(
                    user.pushToken,
                    `Nuevo descuento para ${currentItem.remainingMonths} meses`,
                    `Descuento: ${currentItem.discount}%\nPrecio: ${currentItem.price}\nProyecto: ${currentItem.projectName}\nMeses restantes: ${currentItem.remainingMonths}`,
                    'ic_pie_chart'
                );
            }
        }

        lastBetterItems = newBetterItems;
        console.log(`Se han procesado ${apiData ? apiData.length : 0} elementos del mercado.\n`);

    } catch (error) {
        console.error('❌ Error general durante la ejecución:', error);
    } finally {
        await browser.close();
        console.log('🚪 Navegador cerrado.');
    }
}

export const executeCronMaclear = () => {
    cron.schedule('*/15 9-23 * * *', async () => {
        try {
            await fetchMaclearBetterDiscount();
        } catch (error) {
            console.error('❌ Error en el ciclo del Cron:', error.message);
        }
    });
}