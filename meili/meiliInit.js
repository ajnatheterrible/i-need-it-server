// server/meili/meiliInit.js
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { MeiliSearch } from "meilisearch";
import Listing from "../models/Listing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_KEY = process.env.MEILI_MASTER_KEY;

console.log("MONGO_URI:", process.env.MONGO_URI ? "(set)" : "(MISSING)");
console.log("MEILI_MASTER_KEY:", MEILI_KEY ? "(set)" : "(MISSING)");
console.log("MEILI_HOST:", MEILI_HOST);

const client = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

const getTaskId = (t) => t?.taskUid ?? t?.updateId ?? null;

async function httpGetTask(taskId) {
  const res = await fetch(`${MEILI_HOST}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${MEILI_KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on /tasks/${taskId}`);
  return res.json();
}

async function wait(task) {
  const id = getTaskId(task);
  if (id == null) {
    console.log("no task id to wait for");
    return;
  }

  if (typeof client.waitForTask === "function") {
    const res = await client.waitForTask(id);
    console.log("task", id, res.status);
    if (res.status === "failed")
      throw new Error(res.error?.message || "task failed");
    return;
  }
  const start = Date.now();
  while (true) {
    const s = await httpGetTask(id);
    if (s.status === "succeeded" || s.status === "failed") {
      console.log("task", id, s.status, s.error || "");
      if (s.status === "failed")
        throw new Error(s.error?.message || "task failed");
      return;
    }
    if (Date.now() - start > 60_000)
      throw new Error(`Timed out waiting for task ${id}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const arrify = (x) => (Array.isArray(x) ? x : (x?.results ?? []));

(async () => {
  try {
    console.log("connecting to Mongo…");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ mongo connected");

    const liveQuery = { isSold: false, isDeleted: false, isDraft: false };
    const count = await Listing.countDocuments(liveQuery);
    console.log("Mongo live count:", count);

    try {
      const del = await client.deleteIndex("listings");
      await wait(del);
      console.log("🧹 deleted index");
    } catch {
      console.log("no index to delete");
    }

    let create;
    try {
      create = await client.createIndex("listings", { primaryKey: "_id" });
    } catch {
      create = await client.createIndex({ uid: "listings", primaryKey: "_id" });
    }
    await wait(create);
    console.log("📦 created index");

    const index = client.index("listings");

    const raw = await Listing.find(liveQuery).lean();
    const docs = raw.map((d) => ({ ...d, _id: d._id.toString() }));
    console.log("to index:", docs.length);

    if (docs.length) {
      const add = await index.addDocuments(docs);
      await wait(add);
      console.log("➕ addDocuments done");
    } else {
      console.log("ℹ️ no docs to add");
    }

    const filters = [
      "size",
      "category",
      "department",
      "condition",
      "price",
      "isSold",
      "isDeleted",
      "isDraft",
    ];
    const ftask = await index.updateFilterableAttributes(filters);
    await wait(ftask);
    console.log("⚙️ filterable set:", filters);

    const sample = arrify(await index.getDocuments({ limit: 3 }));
    console.log("📊 sample getDocuments(3):", sample.length);

    const any = await index.search("", { limit: 3 });
    console.log("🔎 search('') hits:", any.hits?.length ?? 0);

    const live = await index.search("", {
      limit: 3,
      filter: "isSold = false AND isDeleted = false AND isDraft = false",
    });
    console.log("🔎 search(LIVE) hits:", live.hits?.length ?? 0);
  } catch (e) {
    console.error("❌ init failed:", e.message);
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
})();
