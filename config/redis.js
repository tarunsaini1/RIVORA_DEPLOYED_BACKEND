import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

const redisClient = createClient({
    url: process.env.REDIS_URL,
});

redisClient.connect()
    .then(() => console.log("Redis connection established"))
    .catch((error) => console.error("Redis connection error:", error));

export default redisClient;