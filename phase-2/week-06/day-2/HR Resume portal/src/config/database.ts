import { Db, MongoClient } from "mongodb";
import { env } from "./env";

let client: MongoClient | undefined;
let databasePromise: Promise<Db> | undefined;

export function getDatabase(): Promise<Db> {
	const uri = env.mongodbUri?.trim();

	if (!uri || uri === "YOUR_MONGODB_CONNECTION_STRING") {
		return Promise.reject(new Error("MONGODB_URI is not configured"));
	}

	if (!databasePromise) {
		client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
		const connectingClient = client;

		databasePromise = connectingClient.connect()
			.then(() => connectingClient.db(env.mongodbDbName))
			.catch(async (error: unknown) => {
				databasePromise = undefined;
				client = undefined;
				await connectingClient.close().catch(() => undefined);
				throw error;
			});
	}

	return databasePromise;
}

export async function closeDatabaseConnection(): Promise<void> {
	const currentClient = client;
	client = undefined;
	databasePromise = undefined;

	if (currentClient) {
		await currentClient.close();
	}
}