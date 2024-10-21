import { Router, Request, Response } from 'express';
import logger from '../logger';
import { getCollection } from '../db/mongoDB';
import { keysToSnakeCase } from '../utils/caseConverter';

const fetchLogs  = Router();
const fetchMemo = Router();

fetchLogs.get('/fetch-logs', async (req: Request, res: Response) => {
    const reqStartBlock = Number(req.query.startBlock);
    const reqEndBlock = Number(req.query.endBlock);
    const reqLimit = Number(req.query.numOfBlocks);
    const reqContract = req.query.contract;

    if (isNaN(reqStartBlock)) {
        res.status(400).json({ success: false, message: 'Invalid startBlock' });
        return;
    }

    if (isNaN(reqLimit) && isNaN(reqEndBlock)) {
        res.status(400).json({ success: false, message: 'Invalid limit or end block' });
        return;
    }

    const startBlock = reqStartBlock;
    let limit = isNaN(reqLimit) ? 1000 : reqLimit;
    limit = limit > 10000 ? 10000 : limit;
    const endBlock = isNaN(reqEndBlock) ? startBlock + limit : reqEndBlock;

    try {
        const contractEventsCollection = await getCollection('contractEvents');
        if (!contractEventsCollection) {
            logger.error('Collection contractEvents not found');
            res.status(500).json({ success: false, message: 'Collection not found' });
            return;
        }

        const filter = {
            BlockHeight: { $gte: startBlock, $lte: endBlock }
        };

        const result = await contractEventsCollection.find(filter).toArray();
        res.json(keysToSnakeCase(result as any));
    } catch (error) {
        logger.error(`Error fetching logs data: ${error}`);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

fetchMemo.get('/fetch-memo', async (req: Request, res: Response) => {
    const memo = (req.query.memo);

    try {
        const contractEventsCollection = await getCollection('contractEvents');
        if (!contractEventsCollection) {
            logger.error('Collection contractEvents not found');
            res.status(500).json({ success: false, message: 'Collection not found' });
            return;
        }

        // Define the unique field or combination of fields that identify the event
        const query = { OpReturnData : memo };

        const result = await contractEventsCollection.find(query).toArray();
        res.json(keysToSnakeCase(result as any));

    } catch (error) {
        logger.error(`Error fetching memo data: ${error}`);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

export { fetchLogs, fetchMemo };
