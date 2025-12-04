import express from "express";
import {
  purchaseListing,
  getOrderById,
  simulateOrderStatus,
  verifyOrderZip,
  issueRefund,
  priceDropListing,
} from "../controllers/orderController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

router.post("/purchase", requireAuth, purchaseListing);
router.get("/:id", requireAuth, getOrderById);
router.patch("/:id/simulate", requireAuth, simulateOrderStatus);
router.post("/:id/verify-zip", requireAuth, verifyOrderZip);
router.post("/:id/refund", requireAuth, issueRefund);
router.post("/price-drop", requireAuth, priceDropListing);

export default router;
