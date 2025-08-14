import mongoose from "mongoose";
import client from "../meili/meili.js";

import Listing from "../models/Listing.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";
import { upsertListingToMeili } from "../meili/meiliSync.js";

export const purchaseListing = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user || !user._id) throw createError("Unauthorized", 401);

  const { listingId, shippingAddress, tax = 0 } = req.body;

  if (!listingId || !shippingAddress) {
    throw createError("Missing required fields", 400);
  }

  const listing = await Listing.findById(listingId);
  if (!listing) throw createError("Listing not found", 404);

  if (
    listing.isSold ||
    listing.isDeleted ||
    listing.isArchived ||
    listing.isDraft
  ) {
    throw createError("Listing is not available for purchase", 400);
  }

  if (String(listing.seller) === String(user._id)) {
    throw createError("You cannot purchase your own listing", 403);
  }

  const region = listing.shippingRegions.find(
    (r) => r.region === "United States" && r.enabled
  );
  if (!region) {
    throw createError("Shipping not available to selected region", 400);
  }

  const shipping = listing.isFreeShipping ? 0 : Number(region.cost || 0);
  const listingPrice = Number(listing.price);
  const total = listingPrice + shipping + Number(tax);
  const total_cents = Math.round(total * 100);

  if ((user.virtualBalanceCents || 0) < total_cents) {
    throw createError("Insufficient credit to complete purchase", 400);
  }

  const session = await mongoose.startSession();

  let updatedListing, order;

  try {
    await session.withTransaction(async () => {
      updatedListing = await Listing.findOneAndUpdate(
        { _id: listingId, isSold: false },
        { isSold: true, buyer: user._id },
        { session, new: true }
      );

      if (!updatedListing) {
        throw createError("Listing already sold", 409);
      }

      await User.updateOne(
        { _id: user._id },
        { $inc: { virtualBalanceCents: -total_cents } },
        { session }
      );

      const existingOrder = await Order.findOne(
        { listing: listingId, buyer: user._id },
        null,
        { session }
      );

      if (existingOrder) {
        throw createError("Duplicate order attempt", 409);
      }

      [order] = await Order.create(
        [
          {
            listing: updatedListing._id,
            buyer: user._id,
            seller: updatedListing.seller,
            status: "PAID",
            shippingAddress,
            shippingFrom: `${updatedListing.shippingFrom.city}, ${updatedListing.shippingFrom.state}`,
            price: {
              listingPrice,
              shipping,
              tax,
              total,
            },
            total_cents,
            currency: "USD",
            paymentMethod: "Credit",
            listingSnapshot: {
              title: updatedListing.title,
              designer: updatedListing.designer,
              size: updatedListing.size,
              price_cents: Math.round(updatedListing.price * 100),
              imageUrl:
                updatedListing.thumbnail || updatedListing.images?.[0] || "",
            },
            orderId: new mongoose.Types.ObjectId().toString(),
          },
        ],
        { session }
      );
    });

    await upsertListingToMeili(updatedListing);

    res.status(201).json({ message: "Order placed", order });
  } finally {
    session.endSession();
  }
});

export const getOrderById = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  if (!user) throw createError("Unauthorized", 401);
  if (!id) throw createError("Order ID is required", 400);

  const order = await Order.findById(id)
    .populate("buyer", "username email")
    .populate("seller", "username email")
    .populate("listing");

  if (!order) throw createError("Order not found", 404);

  const buyerId =
    order?.buyer && typeof order.buyer === "object"
      ? order.buyer._id
      : order?.buyer;

  const sellerId =
    order?.seller && typeof order.seller === "object"
      ? order.seller._id
      : order?.seller;

  const isBuyer = String(buyerId || "") === String(user._id);
  const isSeller = String(sellerId || "") === String(user._id);

  if (!isBuyer && !isSeller) {
    throw createError("Forbidden", 403);
  }

  res.status(200).json(order);
});
