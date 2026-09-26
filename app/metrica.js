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
])

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

    sendMetrics(currency, metrics);
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
    
    sendMetrics(currency, metrics);
}

function sendMetrics(currency, values) {

    // StatsD expected string format:
    const vol_msg = Buffer.from(`currency.${currency}.volume:${values[0]}|g`);
    const net_msg = Buffer.from(`currency.${currency}.net:${values[1]}|g`);
    const msgs = [vol_msg, net_msg];

    for (let i = 0; i < 2; i++){
        let msg = msgs[i];
        clienteStatsD.send(msg, 0, msg.length, statsd_port, statsd_host, (error) => {
            if (error) {
                console.error(`Error sending metric ${currency}:`, error.msg);
            }
        });
    }
}

//each 10 seconds the movements are send
function sendMetricsPeriodically(){
    for (let [currency, metrics] of currency_metrics){
        sendMetrics(currency, metrics);
    }
}
const interval = setInterval(sendMetricsPeriodically, 5000);
