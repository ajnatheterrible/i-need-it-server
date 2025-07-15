import express from "express";
import {
  getFeedListings,
  getListingById,
  getRandomListings,
  getDrafts,
} from "../controllers/listingController.js";

import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

router.get("/feed", getFeedListings);
router.get("/random", getRandomListings);
router.get("/get-drafts", requireAuth, getDrafts);
router.get("/:id", getListingById);

export default router;
