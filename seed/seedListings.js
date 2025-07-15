import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import Listing from "../models/Listing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const data = await fs.readFile(
  path.join(__dirname, "sampleListings.json"),
  "utf-8"
);
const sampleListings = JSON.parse(data);

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await Listing.deleteMany({});
    await Listing.insertMany(sampleListings);
    console.log("✅ Listings seeded!");
    process.exit();
  } catch (err) {
    console.error("❌ Seeding error:", err);
    process.exit(1);
  }
};

seed();
