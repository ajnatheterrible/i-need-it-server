import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { MeiliSearch } from "meilisearch";

import Listing from "../models/Listing.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Offer from "../models/Offer.js";
import Message from "../models/Message.js";
import Thread from "../models/Thread.js";
import Platform from "../models/Platform.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

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

async function meiliSeed() {
  try {
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
    console.log(`🔍 Meili indexed ${stats.numberOfDocuments} listings.`);
  } catch (err) {
    console.error("❌ Meili seeding error:", err);
  }
}

async function seedAll() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🔗 Connected to MongoDB.");

    await Promise.all([
      Listing.deleteMany({}),
      Order.deleteMany({}),
      Offer.deleteMany({}),
      Message.deleteMany({}),
      Thread.deleteMany({}),
      Platform.deleteMany({}),
    ]);
    console.log(
      "🧹 Cleared listings, orders, offers, messages, threads, and platform data."
    );

    await User.updateMany({}, { $set: { virtualBalanceCents: 500000 } });
    console.log("💰 Reset all user balances to 500000 cents.");

    const data = await fs.readFile(
      path.join(__dirname, "sampleListings.json"),
      "utf-8"
    );
    const sampleListings = JSON.parse(data);
    await Listing.insertMany(sampleListings);
    console.log(`✅ Inserted ${sampleListings.length} sample listings.`);

    await meiliSeed();

    console.log("🎉 Seeding complete!");
  } catch (err) {
    console.error("❌ Seeding error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

seedAll();
