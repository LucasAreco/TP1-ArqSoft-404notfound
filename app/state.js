import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import readline from 'readline';

let accounts = null;
let rates = null;
let log = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACCOUNTS = "./state/accounts.json";
const RATES = "./state/rates.json";
const LOG = "./state/log.ndjson";

export async function init() {
  accounts = await load(ACCOUNTS);
  rates = await load(RATES);

  scheduleSave(accounts, ACCOUNTS, 1000, save);
  scheduleSave(rates, RATES, 5000, save);
  scheduleLogSave(1000);
}

export function getAccounts() {
  return accounts;
}

export function getRates() {
  return rates;
}


async function load(fileName) {
  const filePath = path.join(__dirname, fileName);

  try {
    await fs.promises.access(filePath);
    const raw = await fs.promises.readFile(filePath, "utf8");
    
    return JSON.parse(raw);
  } catch (err) {
    if (err.code == "ENOENT") {
      console.error(`${filePath} not found`);
    } else {
      console.error(`Error loading ${filePath}:`, err);
    }
  }
}

async function save(data, fileName) {
  const filePath = path.join(__dirname, fileName);
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing to ${filePath}:`, err);
  }
}


function scheduleSave(data, fileName, period) {
  setInterval(async () => {
    await save(data, fileName);
  }, period);
}


export async function saveLog(log){
  if (!log || log.length === 0){
    return;
  }
  const filePath = path.join(__dirname, LOG);
  await fs.promises.appendFile(filePath, log);
}

async function scheduleLogSave(period){
  setInterval(async () => {
    const buffer_log = log;
    log = "";
    try{
      await saveLog(buffer_log)
    } catch (err){
      console.error('Error al persistir logs en disco:', err);
      throw new Error(err)
    }
  }, period)
}

export async function getLogPage(page, limit){
  const filePath = path.join(__dirname, LOG);
  const results = []
  let file = null
  let buffReader = null
  try {
    await fs.promises.access(filePath);
    file = fs.createReadStream(filePath, {encoding: "utf8"});
    buffReader = readline.createInterface({
      input: file,
      crlfDelay: Infinity
    })

    const startRow = (page - 1) * limit;
    const endRow = startRow + limit;
    let rowIdx = 0;

    for await (const line of buffReader){
      const trimmedLine = line.trim();

      if (trimmedLine && rowIdx >= startRow && rowIdx < endRow){
        try{
          results.push(JSON.parse(trimmedLine));
        } catch (err){
          console.error(`Error reading line ${rowIdx}. Error:`, err)
        }
      }
      
      rowIdx ++;
      if (rowIdx >= endRow){
        break
      }
    }

  }catch (err) {
    if (err.code == "ENOENT") {
      console.error(`${filePath} not found`);
    } else {
      console.error(`Error reading ${filePath}:`, err);
    }

  } finally{
    if (buffReader){
      buffReader.close();
    }

    if (file){
      file.destroy();
    }

    return results;
  }
}

export function loadNewLog(item){
  try{
    log += JSON.stringify(item) + '\n';
  }catch (err){
    console.error("Formato invalido de item a logear. Error: ", err)
  } 
}