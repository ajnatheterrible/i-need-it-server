import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { MeiliSearch } from "meilisearch";
import Listing from "../models/Listing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const client = new MeiliSearch({
  host: "http://127.0.0.1:7700",
  apiKey: process.env.MEILI_MASTER_KEY,
});

const indexName = "listings";
const index = client.index(indexName);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilDocsCount(
  expected,
  { timeoutMs = 15000, intervalMs = 200 } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const stats = await index.getStats();
      if (stats?.numberOfDocuments >= expected) return stats;
    } catch (_) {}
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${expected} documents to be indexed`);
}

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    try {
      await client.deleteIndex(indexName);
    } catch (_) {}

    await client.createIndex(indexName, { primaryKey: "_id" });

    const listings = await Listing.find().lean();
    const payload = listings.map((l) => ({ ...l, _id: String(l._id) }));

    await index.addDocuments(payload);

    await index.updateSettings({
      searchableAttributes: ["title", "designer", "description"],
      filterableAttributes: [
        "isSold",
        "isDeleted",
        "isDraft",
        "department",
        "category",
        "condition",
        "size",
        "price",
      ],
      sortableAttributes: ["price", "createdAt"],
    });

    const stats = await waitUntilDocsCount(payload.length);

    const { results } = await index.getDocuments({ limit: 3 });
    console.log("📦 Listings in Meili (stats):", stats.numberOfDocuments);
    console.log("📦 Listings fetched (sample):", results.length);
  } catch (err) {
    console.error("❌ Error during Meili seeding:", err);
  } finally {
    process.exit();
  }
};

seed();
