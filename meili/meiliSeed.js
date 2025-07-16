import mongoose from "mongoose";
import dotenv from "dotenv";
import client from "./meili.js";
import Listing from "../models/Listing.js";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const listings = await Listing.find().lean();

await client.index("listings").addDocuments(listings);

process.exit();
