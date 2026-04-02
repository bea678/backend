import admin from 'firebase-admin';
import db from './db.js';

export const sendPushNotification = async (fcmToken, title, body) => {
    const message = {
        notification: {
            title: title,
            body: body,
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'high_importance_channel',
                sound: 'default',
                priority: 'high',
                clickAction: 'fcm.ACTION_EVENT',
                icon: 'ic_notification_bear',
            },
        },
        data: {
            tipo: 'arbitraje_alert',
            id: '12345'
        },
        token: fcmToken,
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('✅ Mensaje enviado exitosamente:', response);
        return response;
    } catch (error) {
        console.error('❌ Error enviando el mensaje:', error);
        throw error;
    }
};
export const getUserById = async (id) => {
    try {
        const query = 'SELECT * FROM users WHERE id = ? LIMIT 1';
        const [rows] = await db.execute(query, [id]);

        if (rows.length === 0) {
            console.log(`⚠️ No se encontró el usuario con ID: ${id}`);
            return null;
        }

        return rows[0];
    } catch (error) {
        console.error('❌ Error al obtener usuario:', error.message);
        throw error;
    }
};