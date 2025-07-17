import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { MeiliSearch } from "meilisearch";
import Listing from "../models/Listing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

console.log("Loaded MONGO_URI:", process.env.MONGO_URI);
console.log("Loaded MEILI_MASTER_KEY:", process.env.MEILI_MASTER_KEY);

const client = new MeiliSearch({
  host: "http://127.0.0.1:7700",
  apiKey: process.env.MEILI_MASTER_KEY || "your-hardcoded-meili-key-if-needed",
});

try {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const listings = await Listing.find().lean();

  const response = await client.index("listings").addDocuments(listings);

  console.log("Successfully seeded Meilisearch:", response);
} catch (err) {
  console.error("Error during seeding:", err);
} finally {
  process.exit();
}
