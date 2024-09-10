import { Collection } from 'mongodb';
import { PRUNE_AFTER } from '../../../constant';

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

export async function createTTLIndex(collection: Collection<Document>): Promise<void> {
    const indexName = "createdAt_1"; // Default MongoDB name for the index on createdAt field

    // Ensure PRUNE_AFTER is a valid number
    if (isNaN(PRUNE_AFTER)) {
        throw new Error(`PRUNE_AFTER is NaN. Please define a valid numeric value for PRUNE_AFTER.`);
    }

    // Get existing indexes
    const existingIndexes = await collection.indexes();

    // Check if the index already exists
    const existingIndex = existingIndexes.find(index => index.name === indexName);

    // If the index exists, check its expireAfterSeconds option
    if (existingIndex) {
        // If the expireAfterSeconds option is different, drop the existing index
        if (existingIndex.expireAfterSeconds !== PRUNE_AFTER) {
            console.log(`Dropping existing index ${indexName} due to option mismatch.`);
            await collection.dropIndex(indexName);
        } else {
            // The index already exists with the correct options, so return early
            console.log(`Index ${indexName} already exists with the correct options. Skipping creation.`);
            return;
        }
    }

    // Create the index with the desired expireAfterSeconds value
    console.log(`Creating index ${indexName} with expireAfterSeconds: ${PRUNE_AFTER}`);
    await collection.createIndex({ "createdAt": 1 }, { expireAfterSeconds: PRUNE_AFTER });
}

