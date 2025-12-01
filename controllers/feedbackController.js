import asyncHandler from "../middleware/asyncHandler.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import Order from "../models/Order.js";

const RECALC_TAGS = ["FAST_SHIPPER", "ITEM_AS_DESCRIBED", "QUICK_REPLIES"];

async function recalcSellerStats(sellerId) {
  const agg = await Review.aggregate([
    { $match: { seller: sellerId } },
    {
      $group: {
        _id: "$seller",
        ratingAverage: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
        fastShipperCount: {
          $sum: {
            $cond: [{ $in: ["FAST_SHIPPER", "$tags"] }, 1, 0],
          },
        },
        itemAsDescribedCount: {
          $sum: {
            $cond: [{ $in: ["ITEM_AS_DESCRIBED", "$tags"] }, 1, 0],
          },
        },
        quickRepliesCount: {
          $sum: {
            $cond: [{ $in: ["QUICK_REPLIES", "$tags"] }, 1, 0],
          },
        },
      },
    },
  ]);

  const seller = await User.findById(sellerId);
  if (!seller) return;

  if (!agg.length) {
    seller.sellerReviewStats = {
      ratingAverage: 0,
      ratingCount: 0,
      tagCounts: {
        FAST_SHIPPER: 0,
        ITEM_AS_DESCRIBED: 0,
        QUICK_REPLIES: 0,
      },
    };
  } else {
    const stats = agg[0];
    seller.sellerReviewStats = {
      ratingAverage: stats.ratingAverage || 0,
      ratingCount: stats.ratingCount || 0,
      tagCounts: {
        FAST_SHIPPER: stats.fastShipperCount || 0,
        ITEM_AS_DESCRIBED: stats.itemAsDescribedCount || 0,
        QUICK_REPLIES: stats.quickRepliesCount || 0,
      },
    };
  }

  await seller.save();
}

export const createReview = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const reviewerId = req.user._id;
  const { rating, tags = [], comment } = req.body;

  const existing = await Review.findOne({
    order: orderId,
    reviewer: reviewerId,
  });

  if (existing) {
    res.status(409);
    throw new Error("Review already exists for this order.");
  }

  const order = await Order.findById(orderId).populate("seller");
  if (!order) {
    res.status(404);
    throw new Error("Order not found.");
  }

  if (String(order.buyer) !== String(reviewerId)) {
    res.status(403);
    throw new Error("You can only review your own orders.");
  }

  const review = await Review.create({
    order: order._id,
    reviewer: reviewerId,
    seller: order.seller._id,
    rating,
    tags: Array.isArray(tags) ? tags : [],
    comment,
  });

  await recalcSellerStats(order.seller._id);

  res.status(201).json(review);
});

export const updateReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const reviewerId = req.user._id;
  const { rating, tags = [], comment } = req.body;

  const review = await Review.findById(reviewId);
  if (!review) {
    res.status(404);
    throw new Error("Review not found.");
  }

  if (String(review.reviewer) !== String(reviewerId)) {
    res.status(403);
    throw new Error("You can only edit your own reviews.");
  }

  review.rating = rating;
  review.tags = Array.isArray(tags) ? tags : [];
  review.comment = comment;

  await review.save();
  await recalcSellerStats(review.seller);

  res.json(review);
});

export const getSellerReviewStats = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;

  let seller = await User.findById(sellerId).select("sellerReviewStats");
  if (!seller) {
    res.status(404);
    throw new Error("Seller not found.");
  }

  if (!seller.sellerReviewStats) {
    await recalcSellerStats(sellerId);
    seller = await User.findById(sellerId).select("sellerReviewStats");
  }

  const baseStats = seller.sellerReviewStats || {
    ratingAverage: 0,
    ratingCount: 0,
    tagCounts: {
      FAST_SHIPPER: 0,
      ITEM_AS_DESCRIBED: 0,
      QUICK_REPLIES: 0,
    },
  };

  const transactionsCount = await Order.countDocuments({ seller: sellerId });

  res.json({
    ...baseStats,
    transactionsCount,
  });
});

export const getSellerReviews = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;

  const reviews = await Review.find({ seller: sellerId })
    .populate({
      path: "order",
      select: "listing listingSnapshot createdAt",
    })
    .populate({
      path: "reviewer",
      select: "username profileImage",
    })
    .sort({ createdAt: -1 });

  res.json(reviews);
});

export const getOrderReviewForViewer = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const viewerId = req.user._id;

  const review = await Review.findOne({
    order: orderId,
    reviewer: viewerId,
  });

  if (!review) {
    return res.json(null);
  }

  res.json(review);
});

export const getListingReviewForViewer = asyncHandler(async (req, res) => {
  const { listingId } = req.params;
  const viewerId = req.user._id;

  const order = await Order.findOne({
    listing: listingId,
    buyer: viewerId,
  }).sort({ createdAt: -1 });

  if (!order) {
    return res.json({ orderId: null, review: null });
  }

  const review = await Review.findOne({
    order: order._id,
    reviewer: viewerId,
  });

  res.json({
    orderId: order._id,
    review: review || null,
  });
});
