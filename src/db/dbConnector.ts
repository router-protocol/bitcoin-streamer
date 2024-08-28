import { initializeMongoDB } from "./mongoDB"; // Ensure the path matches your project structure

export const initializeDB = async () => {
    // If in the future you decide to support multiple database types, you can add the logic here.
    // For now, we'll directly initialize and return the MongoDB connection.
    return await initializeMongoDB();
};
