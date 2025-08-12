import express from "express";
import {
  purchaseListing,
  getOrderById,
} from "../controllers/orderController.js";

import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

router.post("/purchase", requireAuth, purchaseListing);
router.get("/:id", requireAuth, getOrderById);

export default router;
