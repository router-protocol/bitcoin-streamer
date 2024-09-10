import * as path from 'path';

require("dotenv").config({ path: path.resolve(__dirname, '../../.env') });

type Chain = {
  id: string;
  name: string;
  startBlock: number;
};

export const bitcoinTestnet: Chain = {
  id: "bitcoin-testnet",
  name: "Bitcoin-Testnet",
  startBlock: Number(process.env.START_BLOCK),
};

export const bitcoinMainnet: Chain = {
  id: "bitcoin",
  name: "Bitcoin",
  startBlock: Number(process.env.START_BLOCK),
};

const idmp = {
  "bitcoin-testnet": bitcoinTestnet,
  "bitcoin": bitcoinMainnet
};

export const getNetwork = (id: string) => idmp[id];

export const MONGO_DB_URI = process.env.MONGO_DB_URI ?? "mongodb://127.0.0.1:27017/";
export const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL; // For alerting, if applicable
export const ALERTER_ACTIVE = process.env.ALERTER_ACTIVE === "true"; // Feature flag for enabling/disabling alerts
export const PRUNE_AFTER = parseInt(process.env.PRUNE_AFTER ?? "604800");
