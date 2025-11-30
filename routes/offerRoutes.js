import express from "express";
import {
  createOffer,
  createSellerPrivateOffer,
  acceptOffer,
  declineOffer,
  broadcastOffers,
  getBroadcastStatus,
  getActiveSellerOfferForListing,
} from "../controllers/offerController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

router.post("/:listingId", requireAuth, createOffer);
router.post("/:listingId/seller", requireAuth, createSellerPrivateOffer);
router.post("/:listingId/broadcast", requireAuth, broadcastOffers);
router.get("/:listingId/broadcast/status", requireAuth, getBroadcastStatus);
router.put("/:id/accept", requireAuth, acceptOffer);
router.put("/:id/decline", requireAuth, declineOffer);
router.get(
  "/active-seller-offer/:listingId",
  requireAuth,
  getActiveSellerOfferForListing
);

export default router;
