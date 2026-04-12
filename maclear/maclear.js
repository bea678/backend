import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getUserById, sendPushNotification } from "../generalFunctions.js";
import cron from 'node-cron';
import fs from 'node:fs/promises';

puppeteer.use(StealthPlugin());
let lastBetterItems = [];

export async function fetchMaclearBetterDiscount() {
    console.log('🚀 Iniciando navegador MACLEAR en el servidor...');

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    const user = await getUserById(1); 

    try {
        const cookiesString = await fs.readFile('./maclear/cookies.json', 'utf8');
        let rawCookies = JSON.parse(cookiesString);
        
        // Limpiamos las cookies para evitar el error de formato de Puppeteer
        const cleanCookies = rawCookies.map(cookie => {
            return {
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path || '/',
                secure: cookie.secure === true, 
                httpOnly: cookie.httpOnly === true,
            };
        });

        await page.setCookie(...cleanCookies);
        console.log('🍪 Cookies inyectadas y limpiadas correctamente. Sesión restaurada.');
    } catch (error) {
        console.error('❌ Error inyectando cookies:', error.message);
        await sendPushNotification(
            user.pushToken,
            "Bot Maclear: Error de Cookies",
            "Fallo al leer o inyectar cookies.json. Revisa los logs.",
            'ic_pie_chart'
        );
        await browser.close();
        return;
    }

    let tokenAtrapado = null;
    page.on('request', interceptedRequest => {
        const headers = interceptedRequest.headers();
        if (headers['authorization'] && headers['authorization'].startsWith('Bearer ')) {
            tokenAtrapado = headers['authorization'];
        }
    });

    try {
        console.log('🛡️ Navegando a Maclear para atrapar el token...');
        
        await page.goto('https://app.maclear.ch/en/dashboard/secondary-market', {
            // Espera solo a que el HTML base cargue, sin importar si los scripts/imágenes siguen cargando
            waitUntil: 'domcontentloaded', 
            // Aumentamos el límite a 60 segundos por si el servidor va lento (0 lo haría infinito)
            timeout: 60000 
        });

        // Tu espera manual de 4 segundos le dará tiempo al frontend 
        // para ejecutar su JavaScript y disparar la petición que contiene el token.
        await new Promise(r => setTimeout(r, 4000));

        if (!tokenAtrapado) {
            console.error('❌ No se capturó el token. Las cookies han caducado o cerrado sesión.');
            await sendPushNotification(
                user.pushToken,
                "Bot Maclear: Sesión Caducada",
                "Exporta un nuevo cookies.json de tu PC y súbelo al servidor.",
                'ic_pie_chart'
            );
            return;
        }

        console.log('✅ Token fresco atrapado. Lanzando la petición a la API...');

        const apiData = await page.evaluate(async (tokenDinamico) => {
            try {
                const response = await fetch('https://app.maclear.ch/api/v1/market/list', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'authorization': tokenDinamico,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        "column": "discount",
                        "page": 1,
                        "per-page": 1500,
                        "typeSort": 3
                    })
                });

                const rawText = await response.text();

                if (!response.ok) {
                    return { error: `HTTP ${response.status}`, body: rawText };
                }

                return JSON.parse(rawText);
            } catch (err) {
                return { error: err.message };
            }
        }, tokenAtrapado); 

        if (apiData.error != undefined) {
            await sendPushNotification(
                user.pushToken,
                "Error en la API de Maclear",
                apiData.error,
                'ic_pie_chart'
            );

            console.error('❌ Api data undefined o con error:', apiData.error);
            return;
        }

        let newBetterItems = [];
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
    //cron.schedule('*/10 7-22 * * *', async () => {
    cron.schedule('*/30 * * * * *', async () => {
        try {
            await fetchMaclearBetterDiscount();
        } catch (error) {
            console.error('❌ Error en el ciclo del Cron:', error.message);
        }
    });
}