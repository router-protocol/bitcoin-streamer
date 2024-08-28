import { Collection } from 'mongodb';

export async function updateLastUpdatedBlock(collection: Collection, block: number): Promise<void> {
    try {
	console.log("Updating Block in Db to : ",block)
        const result = await collection.findOne({ id: "CHAIN_STATE" });
	
        if (!result) {
            await collection.insertOne({
                id: "CHAIN_STATE",
                lastSyncedBlock: block,
            });
        } else if (result.lastSyncedBlock < block) {
            await collection.updateOne(
                { id: "CHAIN_STATE" },
                { $set: { lastSyncedBlock: block } }
            );
        }
    } catch (error) {
        console.error('Error updating last synced block:', error);
    }
}

export async function getLastSyncedBlock(collection: Collection): Promise<number> {
    try {
        const result = await collection.findOne({ id: "CHAIN_STATE" });
        return result?.lastSyncedBlock ?? 0;
    } catch (error) {
        console.error('Error getting last synced block:', error);
        return 0;
    }
}
