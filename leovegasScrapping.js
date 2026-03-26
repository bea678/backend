import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import { PORT } from './config.js';

const app = express();

/**
 * Calcula la hora de inicio basándose en los minutos data-countdown
 */
function obtenerHoraInicio(minutosParaEmpezar) {
    if (isNaN(minutosParaEmpezar)) return "En Juego / Ya empezado";
    const ahora = new Date();
    const horaInicio = new Date(ahora.getTime() + minutosParaEmpezar * 60000);
    const horas = horaInicio.getHours().toString().padStart(2, '0');
    const minutos = horaInicio.getMinutes().toString().padStart(2, '0');
    return `${horas}:${minutos}`;
}

/**
 * Analiza si hay arbitraje y calcula el beneficio o pérdida
 */
function calcularDetalleArbitraje(c1, cX, c2) {
    const q1 = parseFloat(c1);
    const qX = parseFloat(cX);
    const q2 = parseFloat(c2);

    if (!q1 || !qX || !q2) return null;

    // Probabilidad implícita (Inversión necesaria para obtener 1 unidad de retorno)
    const probabilidadTotal = (1 / q1) + (1 / qX) + (1 / q2);
    
    // El ROI se calcula sobre la inversión total
    // Si la probabilidad es 1.05, necesitas invertir 1.05€ para ganar 1€. ROI = -4.76%
    // Si la probabilidad es 0.95, necesitas invertir 0.95€ para ganar 1€. ROI = +5.26%
    const roi = ((1 / probabilidadTotal) - 1) * 100;
    const hayArbitraje = probabilidadTotal < 1.0;

    return {
        hayArbitraje,
        roi: roi.toFixed(2),
        probabilidad: probabilidadTotal.toFixed(4),
        stakes: {
            local: (100 / (q1 * probabilidadTotal)).toFixed(2),
            empate: (100 / (qX * probabilidadTotal)).toFixed(2),
            visitante: (100 / (q2 * probabilidadTotal)).toFixed(2)
        }
    };
}

async function scrapeLeovegasFootball() {
  const url = 'https://www.betfair.es/sport/football';
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
  };

  try {
    const { data } = await axios.get(url, { headers });
    const $ = cheerio.load(data);

    // Localizar sección "Hoy"
    const seccionHoy = $('li.section').filter((i, el) => {
        return $(el).find('.section-header-title').text().trim() === 'Hoy';
    });

    if (seccionHoy.length === 0) {
        console.log('⚠️ Sección "Hoy" no encontrada.');
        return;
    }

    const items = seccionHoy.find('li.com-coupon-line-new-layout.betbutton-layout.avb-row.avb-table.market-avb.quarter-template.market-2-columns');
    console.log(`\n--- ANALIZANDO ${items.length} PARTIDOS DE HOY ---\n`);

    const resultados = [];

    items.each((i, el) => {
      const $el = $(el);
      const eventId = $el.find('.event-information').attr('data-eventId') || $el.find('.event-information').attr('data-eventid');
      const competicion = $el.find('a.event-link').attr('data-competition') || "Liga";
      const homeTeam = $el.find('.team-name').first().text().trim();
      const awayTeam = $el.find('.team-name').last().text().trim();
      const minutos = parseInt($el.find('.ui-countdown').attr('data-countdown'), 10);
      const hora = obtenerHoraInicio(minutos);

      // Cuotas
      const cuotas = [];
      $el.find('div.details-market.market-3-runners .ui-display-decimal-price').each((idx, p) => {
          cuotas.push($(p).text().trim());
      });

      if (eventId && cuotas.length === 3) {
        const arb = calcularDetalleArbitraje(cuotas[0], cuotas[1], cuotas[2]);

        console.log(`🏆 ${competicion} | 🕒 ${hora}`);
        console.log(`⚽ ${homeTeam} vs ${awayTeam}`);
        console.log(`📊 Cuotas: [1: ${cuotas[0]}] [X: ${cuotas[1]}] [2: ${cuotas[2]}]`);

        if (arb.hayArbitraje) {
            console.log(`✅ ARBITRAJE: SI`);
            console.log(`📈 GANANCIA: +${arb.roi}%`);
            console.log(`💰 Reparto 100€: 1(${arb.stakes.local}€) X(${arb.stakes.empate}€) 2(${arb.stakes.visitante}€)`);
        } else {
            console.log(`❌ ARBITRAJE: NO`);
            console.log(`📉 RENTABILIDAD: ${arb.roi}%`);
        }
        console.log(`--------------------------------------------------\n`);

        resultados.push({ eventId, partido: `${homeTeam} vs ${awayTeam}`, arb });
      }
    });

    await fs.writeFile('data_final.json', JSON.stringify(resultados, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

app.listen(PORT, () => {
    console.log(`🚀 Radar iniciado en puerto ${PORT}`);
    scrapeLeovegasFootball();
});