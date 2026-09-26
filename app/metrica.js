import dgram from "dgram";

// We send the metrics to graphite
const clienteStatsD = dgram.createSocket('udp4');
const statsd_host = 'graphite'; 
const statsd_port = 8125;

// currency: [volume, net value]
const currency_metrics = new Map([
    ["ARS", [0, 0]],
    ["BRL", [0, 0]],
    ["EUR", [0, 0]],
    ["USD", [0, 0]],
]);

function sendAllMetrics() {
  const metricsArray = [];

  for (const [currency, metrics] of currency_metrics) {
    metricsArray.push(`currency.${currency}.volume:${metrics[0]}|g`);
    metricsArray.push(`currency.${currency}.net:${metrics[1]}|g`);
  }

  const payload = Buffer.from(metricsArray.join('\n'));

  clienteStatsD.send(payload, 0, payload.length, statsd_port, statsd_host, (error) => {
    if (error) {
      console.error('Error sending metric:', error.message);
    }
  });
}

// Increases volume and net value
export function addBuyingMovement(currency, bought_ammount){
    if (!currency_metrics.has(currency)){
        console.error('Invalid currency');
        return;
    }

    let metrics = currency_metrics.get(currency);
    metrics[0] += bought_ammount;
    metrics[1] += bought_ammount;
    currency_metrics.set(currency, metrics);

    sendAllMetrics(currency, metrics);
}

// Increases volume, but decresses net value
export function addSellingMovement(currency, sold_ammount){
    if (!currency_metrics.has(currency)){
        console.error('Invalid currency');
        return;
    }

    let metrics = currency_metrics.get(currency);
    metrics[0] += sold_ammount;
    metrics[1] -= sold_ammount;
    currency_metrics.set(currency, metrics);
    
    sendAllMetrics();
}

sendAllMetrics()
const interval = setInterval(sendAllMetrics, 3000);
