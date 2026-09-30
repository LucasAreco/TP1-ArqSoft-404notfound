import dgram from "dgram";
import {client, RATE_CURRENCIES_KEY} from "./state.js"

// We send the metrics to graphite
const clienteStatsD = dgram.createSocket('udp4');
const statsd_host = 'graphite'; 
const statsd_port = 8125;


async function sendAllMetrics() {
  const metricsArray = [];
  const currencies = await client.sMembers(RATE_CURRENCIES_KEY);

  for (const currency of currencies) {
    const data = await client.hGetAll(`metrics:${currency}`)
    let volume = 0;
    let net = 0;

    if (data.volume !== undefined){
      volume = data.volume;
    }

    if (data.net !== undefined){
      net = data.net;
    }
    
    if (net < 0) {
      metricsArray.push(`currency.${currency}.net:0|g`);
    }
    metricsArray.push(`currency.${currency}.net:${net}|g`);
    metricsArray.push(`currency.${currency}.volume:${volume}|g`);
  }
  
  const payload = Buffer.from(metricsArray.join('\n'));

  clienteStatsD.send(payload, 0, payload.length, statsd_port, statsd_host, (error) => {
    if (error) {
      console.error('Error sending metric:', error.message);
    }
  });
}

// Increases volume and net value
export async function addBuyingMovement(currency, bought_ammount){
  const currencies = await client.sMembers(RATE_CURRENCIES_KEY);

  if (!currencies.includes(currency)){
    console.error('Invalid currency');
    return;
  }

  await client.multi()
    .hIncrBy(`metrics:${currency}`, 'volume', bought_ammount)
    .hIncrBy(`metrics:${currency}`, 'net', bought_ammount)
    .exec();
}

// Increases volume, but decresses net value
export async function addSellingMovement(currency, sold_ammount){
  const currencies = await client.sMembers(RATE_CURRENCIES_KEY);

  if (!currencies.includes(currency)){
    console.error('Invalid currency');
    return;
  }

  await client.multi()
    .hIncrBy(`metrics:${currency}`, 'volume', sold_ammount)
    .hIncrBy(`metrics:${currency}`, 'net', -sold_ammount)
    .exec();
}

export function startMetricsInterval() {
  sendAllMetrics();
  setInterval(sendAllMetrics, 3000);
}
