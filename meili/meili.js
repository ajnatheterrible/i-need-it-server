import { MeiliSearch } from "meilisearch";
import dotenv from "dotenv";
dotenv.config();

const client = new MeiliSearch({
  host: "http://localhost:7700",
  apiKey: process.env.MEILI_MASTER_KEY,
});

export default client;
