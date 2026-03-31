import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { generarIdUnico, obtenerHoraInicio } from '../scrapeArbitrage.js';

export async function scrapeBetfairFootball() {
    const url = 'https://www.betfair.es/sport/football';
    const headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
    };

    try {
        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);

        const seccionHoy = $('li.section').filter((i, el) => {
            return $(el).find('.section-header-title').text().trim() === 'Hoy';
        });

        if (seccionHoy.length === 0) return {};

        const items = seccionHoy.find('li.com-coupon-line-new-layout.betbutton-layout.avb-row.avb-table.market-avb.quarter-template.market-2-columns');
        const mapaResultados = {};

        items.each((i, el) => {
            const $el = $(el);
            const homeTeam = $el.find('.team-name').first().text().trim();
            const awayTeam = $el.find('.team-name').last().text().trim();
            const minutos = parseInt($el.find('.ui-countdown').attr('data-countdown'), 10);
            const hora = obtenerHoraInicio(minutos);
            
            const cuotas = [];
            $el.find('div.details-market.market-3-runners .ui-display-decimal-price').each((idx, p) => {
                cuotas.push(parseFloat($(p).text().trim()));
            });

            if (homeTeam && awayTeam && cuotas.length === 3) {
                const key = generarIdUnico(homeTeam, awayTeam, hora);
                mapaResultados[key] = {
                    eventId: $el.find('.event-information').attr('data-eventId') || i.toString(),
                    partido: `${homeTeam} vs ${awayTeam}`,
                    cuotas: cuotas,
                    competicion: $el.find('a.event-link').attr('data-competition') || "Liga",
                    hora: hora
                };
            }
        });

        return mapaResultados;
    } catch (error) {
        console.error('❌ Error en Betfair:', error.message);
        return {};
    }
}