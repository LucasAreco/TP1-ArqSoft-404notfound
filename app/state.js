import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { createClient, defineScript } from "redis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_ACCOUNTS = "./state/accounts.json";
const SEED_RATES = "./state/rates.json";

const ACCOUNT_IDS_KEY = "accounts:ids";
const RATE_CURRENCIES_KEY = "rates:currencies";
const LOG_KEY = "log";

const redisUrl = process.env.REDIS_URL || "redis://redis:6379";
// Atomically checks that the account has enough balance and, if so, deducts it.
// Returns 1 if the amount was reserved, 0 otherwise (including invalid or non-positive amounts).
const RESERVE_BALANCE_SCRIPT = `
local balance = tonumber(redis.call("HGET", KEYS[1], "balance"))
local amount = tonumber(ARGV[1])
if balance == nil or amount == nil or amount ~= amount or amount <= 0 or balance < amount then
  return 0
end
redis.call("HINCRBYFLOAT", KEYS[1], "balance", -amount)
return 1
`;

const client = createClient({
  url: redisUrl,
  scripts: {
    reserveBalance: defineScript({
      SCRIPT: RESERVE_BALANCE_SCRIPT,
      NUMBER_OF_KEYS: 1,
      parseCommand(parser, key, amount) {
        parser.pushKey(key);
        parser.push(String(amount));
      },
      transformReply(reply) {
        return reply;
      },
    }),
  },
});
client.on("error", (err) => console.error("Redis Client Error", err));

export async function init() {
  await client.connect();
  await seedIfEmpty();
}

async function seedIfEmpty() {
  const hasAccounts = await client.exists(ACCOUNT_IDS_KEY);
  if (!hasAccounts) {
    const seedAccounts = await loadSeed(SEED_ACCOUNTS);
    for (const account of seedAccounts) {
      await client.hSet(`account:${account.id}`, {
        currency: account.currency,
        balance: account.balance,
      });
      await client.sAdd(ACCOUNT_IDS_KEY, String(account.id));
    }
  }

  const hasRates = await client.exists(RATE_CURRENCIES_KEY);
  if (!hasRates) {
    const seedRates = await loadSeed(SEED_RATES);
    for (const [baseCurrency, counterRates] of Object.entries(seedRates)) {
      await client.hSet(`rates:${baseCurrency}`, counterRates);
      await client.sAdd(RATE_CURRENCIES_KEY, baseCurrency);
    }
  }
}

async function loadSeed(fileName) {
  const filePath = path.join(__dirname, fileName);
  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

// ACCOUNTS

export async function getAccounts() {
  const ids = await client.sMembers(ACCOUNT_IDS_KEY);
  const accounts = [];

  for (const id of ids) {
    const account = await hydrateAccount(id);
    if (account != null) {
      accounts.push(account);
    }
  }

  return accounts;
}

export async function getAccountById(id) {
  return hydrateAccount(id);
}

export async function getAccountByCurrency(currency) {
  const accounts = await getAccounts();
  return accounts.find((account) => account.currency === currency) ?? null;
}

export async function setAccountBalance(id, balance) {
  await client.hSet(`account:${id}`, { balance });
}

export async function incrementAccountBalance(id, delta) {
  await client.hIncrByFloat(`account:${id}`, "balance", delta);
}

// returns true if the amount could be deducted from the account balance
export async function reserveBalance(id, amount) {
  const reserved = await client.reserveBalance(`account:${id}`, amount);
  return reserved === 1;
}

async function hydrateAccount(id) {
  const data = await client.hGetAll(`account:${id}`);

  if (Object.keys(data).length === 0) {
    return null;
  }

  return {
    id: Number(id),
    currency: data.currency,
    balance: Number(data.balance),
  };
}

// RATES

export async function getRates() {
  const bases = await client.sMembers(RATE_CURRENCIES_KEY);
  const rates = {};

  for (const base of bases) {
    const counterRates = await client.hGetAll(`rates:${base}`);
    rates[base] = Object.fromEntries(
      Object.entries(counterRates).map(([currency, rate]) => [currency, Number(rate)])
    );
  }

  return rates;
}

export async function getRate(baseCurrency, counterCurrency) {
  const rate = await client.hGet(`rates:${baseCurrency}`, counterCurrency);
  return rate == null ? null : Number(rate);
}

export async function setRate(baseCurrency, counterCurrency, rate) {
  const reciprocal = Number((1 / rate).toFixed(5));

  await client.hSet(`rates:${baseCurrency}`, { [counterCurrency]: rate });
  await client.hSet(`rates:${counterCurrency}`, { [baseCurrency]: reciprocal });
  await client.sAdd(RATE_CURRENCIES_KEY, [baseCurrency, counterCurrency]);
}

// LOG

export async function getLog() {
  const entries = await client.lRange(LOG_KEY, 0, -1);
  return entries.map((entry) => JSON.parse(entry));
}

export async function appendLog(entry) {
  await client.rPush(LOG_KEY, JSON.stringify(entry));
}
