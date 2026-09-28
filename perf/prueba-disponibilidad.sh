#!/bin/bash
URL=http://localhost:5555
INYECTAR_A=30
LINEA=/tmp/linea_de_tiempo.txt
RESUMEN=/tmp/resumen_disponibilidad.txt
ALOG=/tmp/artillery_disponibilidad.log
: > "$LINEA"; : > "$RESUMEN"; : > "$ALOG"

ms() { date +%s%3N; }
seg() { awk "BEGIN{printf \"%5.1f\", $1/1000}"; }

if [ "$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$URL/rates")" != "200" ]; then
  echo "ERROR: GET /rates no responde 200. Antes de probar:"
  echo "  docker compose up -d && docker compose restart nginx"
  exit 1
fi

# 2. Carga (se usa el artillery instalado en perf/, que arranca más rápido que npx)
ART=./node_modules/.bin/artillery
[ -x "$ART" ] || ART="npx artillery"
$ART run disponibilidad.yaml -e api -o /tmp/disponibilidad.json > "$ALOG" 2>&1 &
ART_PID=$!
echo "Esperando a que Artillery empiece a generar carga..."
until grep -q "Phase started" "$ALOG" 2>/dev/null; do
  if ! kill -0 $ART_PID 2>/dev/null; then echo "Artillery terminó con error:"; cat "$ALOG"; exit 1; fi
  sleep 0.5
done
echo "Carga en curso. El pedido inválido se envía en $INYECTAR_A s (la prueba dura unos 90 s)."

# 3 y 4. Pedido inválido + medición
sleep "$INYECTAR_A"
antes=$(curl -s -o /dev/null -w '%{http_code}' -m 2 "$URL/rates")
resp=$(curl -s -o /dev/null -w '%{http_code}' -m 5 -X POST "$URL/exchange" \
  -H 'Content-Type: application/json' \
  -d '{"baseCurrency":"XXX","counterCurrency":"ARS","baseAccountId":1,"counterAccountId":2,"baseAmount":10}')
echo "$(date +%T) pedido inválido enviado (respuesta $resp)"
inicio=$(ms); cayo=0; volvio=""
for i in $(seq 1 120); do                      # hasta 60 s
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 1 "$URL/rates")
  t=$(( $(ms) - inicio ))
  echo "  $(seg $t) s  ->  GET /rates $code" >> "$LINEA"
  [ "$code" != "200" ] && cayo=1
  if [ "$code" = "200" ] && [ $cayo = 1 ]; then volvio=$t; break; fi
  if [ "$code" = "200" ] && [ $i -ge 10 ]; then break; fi
  sleep 0.5
done
restarts=$(docker inspect -f '{{.RestartCount}}' exchange-api-1 2>/dev/null)

wait $ART_PID

echo
echo "==================== LÍNEA DE TIEMPO ===================="
head -n 25 "$LINEA"
[ "$(wc -l < "$LINEA")" -gt 25 ] && echo "  ... (sigue igual hasta el final)"
echo "======================== RESUMEN ========================"
echo "GET /rates antes del pedido inválido:  $antes"
echo "Respuesta al pedido inválido:          $resp   (000 = sin respuesta)"
if [ $cayo = 0 ]; then
  echo "RESULTADO: el servicio nunca dejó de responder (tiempo fuera de servicio: 0 s)"
elif [ -z "$volvio" ]; then
  echo "RESULTADO: el servicio NO volvió en 60 s (requiere intervención manual)"
else
  echo "RESULTADO: el servicio volvió a responder a los $(seg $volvio) s (tiempo fuera de servicio)"
fi
echo "Reinicios del contenedor de la API:    $restarts"
node -e "
const c = require('/tmp/disponibilidad.json').aggregate.counters;
const total = c['vusers.created'] || 0, ok = c['http.codes.200'] || 0;
console.log('Pedidos de la carga (Artillery):       ' + total + ' enviados, ' + ok + ' OK, ' + (total - ok) + ' fallidos');
"
echo "========================================================="