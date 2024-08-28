import { Collection } from 'mongodb';

export async function putNewBlocklog(collection: Collection, blocklog: { height: number, blockDump: any }): Promise<void> {
    try {
        // Upsert operation to streamline the process
        await collection.updateOne(
            { height: blocklog.height },
            { $setOnInsert: blocklog },
            { upsert: true }
        );
    } catch (error) {
        console.error('Error inserting new block log:', error);
    }
}

export async function getAllBlocklogs(collection: Collection): Promise<any[]> {
    try {
        return await collection.find({}).toArray();
    } catch (error) {
        console.error('Error fetching all block logs:', error);
        return [];
    }
}

export async function getAllBlocklogsAndUpdate(collection: Collection): Promise<void> {
    try {
        const blocklogs = await collection.find({}).toArray();
        blocklogs.forEach(async (blocklog) => {
            // Transform the blockDump data if needed (currently a placeholder)
            const updatedBlockDump = blocklog.blockDump; // Implement transformation logic here
            await collection.updateOne(
                { height: blocklog.height },
                { $set: { blockDump: updatedBlockDump } }
            );
        });
    } catch (error) {
        console.error('Error updating all block logs:', error);
    }
}

export async function getLogsFromBlockHeightToBlockHeight(collection: Collection, { startBlock, endBlock }: { startBlock: number, endBlock?: number }): Promise<any[]> {
    try {
        const filter = endBlock ? { height: { $gte: startBlock, $lte: endBlock } } : { height: { $gte: startBlock } };
        return await collection.find(filter).sort({ height: 1 }).toArray();
    } catch (error) {
        console.error('Error fetching block logs within block height range:', error);
        return [];
    }
}
