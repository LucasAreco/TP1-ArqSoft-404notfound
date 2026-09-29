#!/bin/bash
URL=http://localhost:5555
H='Content-Type: application/json'

ex() {  # ex BASE COUNTER MONTO -> imprime el monto recibido
  curl -s -X POST "$URL/exchange" -H "$H" \
    -d "{\"baseCurrency\":\"$1\",\"counterCurrency\":\"$2\",\"baseAccountId\":1,\"counterAccountId\":2,\"baseAmount\":$3}" \
    | grep -o '"counterAmount":[^,}]*' | cut -d: -f2
}

echo "=================================================="
echo "1. Tasas cargadas"
echo "=================================================="
curl -s "$URL/rates"; echo

echo
echo "=================================================="
echo "2. Ida y vuelta con 1000 unidades de cada moneda"
echo "=================================================="
printf "%-6s %-18s %-18s %s\n" "Moneda" "Recibe en ARS" "Vuelve a recibir" "Diferencia"
for cur in BRL EUR USD; do
  ars=$(ex "$cur" ARS 1000)
  back=$(ex ARS "$cur" "$ars")
  diff=$(node -e "console.log(($back - 1000).toFixed(4))")
  printf "%-6s %-18s %-18s %s\n" "$cur" "$ars" "$back" "$diff"
done

echo
echo "=================================================="
echo "3. PUT /rates USD->ARS = 1513: ¿qué inversa guarda?"
echo "=================================================="
curl -s -X PUT "$URL/rates" -H "$H" -d '{"baseCurrency":"USD","counterCurrency":"ARS","rate":1513}' > /dev/null
inv=$(curl -s "$URL/rates" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).ARS.USD))")
echo "Inversa guardada ARS->USD: $inv  (valor exacto: $(node -e 'console.log(1/1513)'))"
echo "Ida y vuelta con esa tasa: 1513 x $inv = $(node -e "console.log(1513*$inv)")"