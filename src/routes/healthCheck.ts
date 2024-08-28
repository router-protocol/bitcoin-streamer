import { Router, Request, Response } from 'express';
import { getCollection } from '../db/mongoDB';
import { getLastSyncedBlock } from '../db/mongoDB/action/chainState';
import logger from '../logger';

const healthCheck = Router();

healthCheck.get('/health', async (req: Request, res: Response) => {
    try {
        const chainStateCollection = await getCollection('chainState');
        if (!chainStateCollection) {
            logger.error('Failed to retrieve chainState collection');
            res.status(500).json({ success: false, message: 'Failed to retrieve chainState collection' });
            return;
        }

        const lastSyncedBlock = await getLastSyncedBlock(chainStateCollection as any);
        res.json({ success: true, lastSyncedBlock });
    } catch (error) {
        logger.error('Error fetching data:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

export { healthCheck };
