import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

let accounts = null;
let rates = null;
let log = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACCOUNTS = "./state/accounts.json";
const RATES = "./state/rates.json";
const LOG = "./state/log.json";

export async function init() {
  accounts = await load(ACCOUNTS);
  rates = await load(RATES);
  log = [];

  scheduleSave(accounts, ACCOUNTS, 1000, save);
  scheduleSave(rates, RATES, 5000, save);
}

export function getAccounts() {
  return accounts;
}

export function getRates() {
  return rates;
}

export async function getLog() {
  return await load(LOG);
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



function getPrefix(content, idxClosingBracket){
  for (let i = idxClosingBracket -1; i >= 0; i--){
    let char = content[i];

    if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r'){
  
      if (char === '}'){
        return ',\n'
      }else if (char === '['){
        return '\n'
      }else{
        throw new Error("Ultimo caracter invalido: ", char);
      }
    }
  }
}

// Instead of rewriting the whole file, it saves the last second of logs
async function saveLastLogPeriod(filePath, logs) {

  const file = await fs.promises.open(filePath, 'r+');
  try {
    const { size } = await file.stat();

    if (size < 2) {
      await file.writeFile(JSON.stringify(jsonLogs, null, 2), 'utf-8');
      return;
    }

    const bytesToRead = Math.min(size, 64);
    const buffer = Buffer.alloc(bytesToRead);
    const fileOffsetToStart = size - bytesToRead
    
    await file.read(buffer, 0, bytesToRead, fileOffsetToStart);

    const content = buffer.toString('utf-8');
    const closingBracketIndex = content.lastIndexOf(']');

    if (closingBracketIndex === -1) {
      throw new Error("El archivo no tiene un formato de array JSON válido (falta ']')");
    }
    
    const jsonLogs = JSON.stringify(logs, null, 2).trim();
    const newLogsWithoutBrackets = jsonLogs.slice(1, -1).trim();
    const prefix = getPrefix(content, closingBracketIndex);
    
    const payload = `${prefix}${newLogsWithoutBrackets}\n]`;

    const targetOffset = fileOffsetToStart + closingBracketIndex;
    await file.write(Buffer.from(payload, 'utf-8'), 0, Buffer.byteLength(payload), targetOffset);

  } finally {
    await file.close();
  }
}

export async function saveLog(log){
  if (!log || log.length === 0){
    return;
  }

  const filePath = path.join(__dirname, LOG);
  await saveLastLogPeriod(filePath, log);
}