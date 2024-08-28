import { MongoClient, Db, Collection, Document } from 'mongodb';
import logger from '../../logger'; // Update the import path according to your project structure

const dbName = 'bitcoin-streamer';
let mongoClient: MongoClient;
export let DBInstance: Db | null = null;

export async function initializeMongoDB(): Promise<void> {
    try {
        if (!mongoClient) {
            logger.info(`Connecting to MongoDB - ${process.env.MONGO_DB_URI}`);
            const options = {
                maxPoolSize: 10
            };
            mongoClient = new MongoClient(process.env.MONGO_DB_URI as string, options);
            await mongoClient.connect();
            logger.info(`Connected to MongoDB Server`);
            DBInstance = mongoClient.db(dbName);
        }
    } catch (error) {
        logger.error(`Error occurred during MongoDB initialization - ${error}`);
        throw error;
    }
}

export async function closeMongoDBConnection(): Promise<void> {
    if (mongoClient) {
        await mongoClient.close();
        logger.info(`MongoDB connection closed`);
        mongoClient = null;
        DBInstance = null;
    }
}
export function getDb(): Db {
    if (!DBInstance) {
        throw new Error('MongoClient is not initialized. Call initializeMongoDB first.');
    }
    return DBInstance;
}

export function getCollection(collectionName: string): Collection {
    return getDb().collection(collectionName);
}
