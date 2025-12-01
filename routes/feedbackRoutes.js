import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import {
  createReview,
  updateReview,
  getSellerReviewStats,
  getSellerReviews,
  getOrderReviewForViewer,
  getListingReviewForViewer,
} from "../controllers/feedbackController.js";

const router = express.Router();

router.post("/:orderId", requireAuth, createReview);
router.put("/:reviewId", requireAuth, updateReview);
router.get("/order/:orderId/me", requireAuth, getOrderReviewForViewer);
router.get("/seller/:sellerId/stats", getSellerReviewStats);
router.get("/seller/:sellerId", getSellerReviews);
router.get("/listing/:listingId/me", requireAuth, getListingReviewForViewer);

export default router;
