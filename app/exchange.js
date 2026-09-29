import { nanoid } from "nanoid";
import * as state from "./state.js";

//call to initialize the exchange service
export async function init() {
  await state.init();

  await normalizeRates();
  await checkRatesConsistency();
}

// completa/corrige las tasas reciprocas a partir de las tasas directas >= 1
async function normalizeRates() {
  const rates = await state.getRates();
  for (const base of Object.keys(rates)) {
    for (const counter of Object.keys(rates[base])) {
      const direct = rates[base][counter];

      if (direct >= 1) {
        await state.setRate(base, counter, direct);
      }
    }
  }
}

function logInconsistentRates(rates) {
  for (const base of Object.keys(rates)) {
    for (const counter of Object.keys(rates[base])) {
      const back = rates[counter]?.[base];
      const roundTrip = back === undefined ? NaN : rates[base][counter] * back;
      if (!(Math.abs(roundTrip - 1) < 1e-9)) {
        console.error(`Tasa inconsistente ${base}->${counter}->${base}: ida y vuelta = ${roundTrip}`);
      }
    }
  }
}

async function checkRatesConsistency() {
  logInconsistentRates(await state.getRates());
}

//returns all internal accounts
export async function getAccounts() {
  return state.getAccounts();
}

//sets balance for an account
export async function setAccountBalance(accountId, balance) {
  await state.setAccountBalance(accountId, balance);
}

//returns all current exchange rates
export async function getRates() {
  return state.getRates();
}

//returns the whole transaction log
export async function getLogPage(page, limit) {
  return await state.getLogPage(page, limit);
}

//sets the exchange rate for a given pair of currencies, and the reciprocal rate as well
export async function setRate(rateRequest) {
  const { baseCurrency, counterCurrency, rate } = rateRequest;

  await state.setRate(baseCurrency, counterCurrency, rate);
}

//executes an exchange operation
export async function exchange(exchangeRequest) {
  const {
    baseCurrency,
    counterCurrency,
    baseAccountId: clientBaseAccountId,
    counterAccountId: clientCounterAccountId,
    baseAmount,
  } = exchangeRequest;

  //get the exchange rate
  const exchangeRate = await state.getRate(baseCurrency, counterCurrency);
  //compute the requested (counter) amount
  const counterAmount = baseAmount * exchangeRate;
  //find our account on the provided (base) currency
  const baseAccount = await state.getAccountByCurrency(baseCurrency);
  //find our account on the counter currency
  const counterAccount = await state.getAccountByCurrency(counterCurrency);

  //construct the result object with defaults
  const exchangeResult = {
    id: nanoid(),
    ts: new Date(),
    ok: false,
    request: exchangeRequest,
    exchangeRate: exchangeRate,
    counterAmount: 0.0,
    obs: null,
  };

  //atomically check and reserve funds on the counter currency account
  if (await state.reserveBalance(counterAccount.id, counterAmount)) {
    //try to transfer from clients' base account
    if (await transfer(clientBaseAccountId, baseAccount.id, baseAmount)) {
      //try to transfer to clients' counter account
      if (
        await transfer(counterAccount.id, clientCounterAccountId, counterAmount)
      ) {
        //all good, update base balance (counter amount was already reserved)
        await state.incrementAccountBalance(baseAccount.id, baseAmount);
        exchangeResult.ok = true;
        exchangeResult.counterAmount = counterAmount;
      } else {
        //could not transfer to clients' counter account, return base amount to client
        await transfer(baseAccount.id, clientBaseAccountId, baseAmount);
        //release the reserved counter amount
        await state.incrementAccountBalance(counterAccount.id, counterAmount);
        exchangeResult.obs = "Could not transfer to clients' account";
      }
    } else {
      //could not withdraw from clients' account, release the reserved counter amount
      await state.incrementAccountBalance(counterAccount.id, counterAmount);
      exchangeResult.obs = "Could not withdraw from clients' account";
    }
  } else {
    //not enough funds on internal counter account
    exchangeResult.obs = "Not enough funds on counter currency account";
  }

  //log the transaction and return it
  await state.appendLog(exchangeResult);

  return exchangeResult;
}

// internal - call transfer service to execute transfer between accounts
async function transfer(fromAccountId, toAccountId, amount) {
  const min = 200;
  const max = 400;
  return new Promise((resolve) =>
    setTimeout(() => resolve(true), Math.random() * (max - min + 1) + min)
  );
}
