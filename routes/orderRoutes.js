import express from "express";
import {
  purchaseListing,
  getOrderById,
  simulateOrderStatus,
} from "../controllers/orderController.js";

import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

router.post("/purchase", requireAuth, purchaseListing);
router.get("/:id", requireAuth, getOrderById);
router.patch("/:id/simulate", requireAuth, simulateOrderStatus);

export default router;
