import express from "express";

import {
  init as exchangeInit,
  getAccounts,
  setAccountBalance,
  getRates,
  setRate,
  getLog,
  exchange,
} from "./exchange.js";

await exchangeInit();

const app = express();
const port = 3000;

app.use(express.json());

const isPositiveNumber = (n) => typeof n === "number" && isFinite(n) && n > 0;
const isNonNegativeNumber = (n) => typeof n === "number" && isFinite(n) && n >= 0;
const hasAccount = (currency) => getAccounts().some((a) => a.currency === currency);
const hasRate = (base, counter) => typeof getRates()?.[base]?.[counter] === "number";

const badRequest = (res, message) => res.status(400).json({ error: message });


const safe = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// ACCOUNT endpoints

app.get("/accounts", (req, res) => {
  res.json(getAccounts());
});

app.put("/accounts/:id/balance", (req, res) => {
  const accountId = req.params.id;
  const { balance } = req.body;

  if (!accountId || !isNonNegativeNumber(balance)) {
    return badRequest(res, "Malformed request");
  }

  setAccountBalance(accountId, balance);

  res.json(getAccounts());
});

// RATE endpoints

app.get("/rates", (req, res) => {
  res.json(getRates());
});

app.put("/rates", (req, res) => {
  const { baseCurrency, counterCurrency, rate } = req.body;

  if (
    !baseCurrency ||
    !counterCurrency ||
    baseCurrency === counterCurrency ||
    !hasAccount(baseCurrency) ||
    !hasAccount(counterCurrency) ||
    !isPositiveNumber(rate)
  ) {
    return badRequest(res, "Malformed request");
  }

  const newRateRequest = { ...req.body };
  setRate(newRateRequest);

  res.json(getRates());
});

// LOG endpoint

app.get("/log", (req, res) => {
  res.json(getLog());
});

// EXCHANGE endpoint

app.post(
  "/exchange",
  safe(async (req, res) => {
    const {
      baseCurrency,
      counterCurrency,
      baseAccountId,
      counterAccountId,
      baseAmount,
    } = req.body;

    if (
      !baseCurrency ||
      !counterCurrency ||
      !baseAccountId ||
      !counterAccountId ||
      !hasAccount(baseCurrency) ||
      !hasAccount(counterCurrency) ||
      !hasRate(baseCurrency, counterCurrency) ||
      !isPositiveNumber(baseAmount)
    ) {
      return badRequest(res, "Malformed request");
    }

    const exchangeRequest = { ...req.body };
    const exchangeResult = await exchange(exchangeRequest);

    if (exchangeResult.ok) {
      res.status(200).json(exchangeResult);
    } else {
      res.status(500).json(exchangeResult);
    }
  })
);

app.listen(port, () => {
  console.log(`Exchange API listening on port ${port}`);
});

export default app;