import { ApiPromise, WsProvider } from '@polkadot/api';
import { getCollection } from "../db/mongoDB";
import { getLastSyncedBlock } from "../db/mongoDB/action/chainState";
import logger from "../logger";
import sendAlertToSlack from "./sendAlertToSlack";
import { getNetwork } from "../constant/index"

export const healthCheckService: () => Promise<boolean> = async () => {
    try {
        // Connect to the Aleph Zero network

        const network = getNetwork(process.env.CHAIN_ID);

        const api = await ApiPromise.create({ provider: new WsProvider(network.nodeWSUrl) });

        // Get the latest block height
        const latestBlockHash = await api.rpc.chain.getFinalizedHead();
        const latestBlock = await api.rpc.chain.getBlock(latestBlockHash);
        const latestBlockHeight: number = latestBlock.block.header.number.toNumber();

        // Sanity check for startBlock and endBlock
        //const chainstatescollection = await getCollection("chainstates");
        const chainStateCollection = await getCollection('chainState');
        const lastSyncedBlock = await getLastSyncedBlock(chainStateCollection as any);

        const difference = lastSyncedBlock - latestBlockHeight;
        let message = `${network.name} Streamer is ${Math.abs(difference)} blocks ${difference < 0 ? "behind" : "ahead"} of Aleph Zero Network.`;
        logger.info(message);
        message += ` Last synced block: ${lastSyncedBlock} Latest block: ${latestBlockHeight}`;
        logger.info(`Last synced block: ${lastSyncedBlock} Latest block: ${latestBlockHeight}`);
        if (difference < -30) {
            sendAlertToSlack(message);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error fetching data:', error);
        return false;
    }
}
