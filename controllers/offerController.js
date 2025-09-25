import mongoose from "mongoose";
import Offer from "../models/Offer.js";
import Listing from "../models/Listing.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Thread from "../models/Thread.js";
import Order from "../models/Order.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";

export const createOffer = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user?._id) throw createError("Unauthorized", 401);

  const { listingId, amount, shippingAddress, tax = 0, message } = req.body;
  if (!listingId || !amount || !shippingAddress)
    throw createError("Missing required fields", 400);

  const listing = await Listing.findById(listingId);
  if (!listing) throw createError("Listing not found", 404);
  if (listing.isSold || listing.isDeleted || listing.isDraft)
    throw createError("Listing unavailable", 400);
  if (String(listing.seller) === String(user._id))
    throw createError("You cannot make offers on your own listing", 403);
  if (amount > listing.price)
    throw createError("Offer cannot exceed listing price", 400);

  const region = listing.shippingRegions.find(
    (r) => r.region === "United States" && r.enabled
  );
  if (!region)
    throw createError("Shipping not available to selected region", 400);
  const shipping = listing.isFreeShipping ? 0 : Number(region.cost || 0);

  const amount_cents = Math.round(Number(amount) * 100);
  const shipping_cents = Math.round(Number(shipping) * 100);
  const tax_cents = Math.round(Number(tax) * 100);
  const total_cents = amount_cents + shipping_cents + tax_cents;

  if ((user.virtualBalanceCents || 0) < total_cents) {
    throw createError("Insufficient funds to back offer", 400);
  }

  const session = await mongoose.startSession();
  let offer, thread;

  try {
    await session.withTransaction(async () => {
      await User.updateOne(
        { _id: user._id },
        { $inc: { virtualBalanceCents: -total_cents } },
        { session }
      );

      thread =
        (await Thread.findOne({
          listing: listing._id,
          buyer: user._id,
          seller: listing.seller,
        }).session(session)) ||
        (await Thread.create(
          [
            {
              listing: listing._id,
              buyer: user._id,
              seller: listing.seller,
              lastMessageAt: new Date(),
            },
          ],
          { session }
        ).then(([t]) => t));

      offer = await Offer.create(
        [
          {
            listing: listing._id,
            buyer: user._id,
            seller: listing.seller,
            amount_cents,
            shipping_cents,
            tax_cents,
            total_cents,
            status: "pending",
            message,
            fundsHeld: true,
            expiresAt: req.body.expiresAt || null,
          },
        ],
        { session }
      ).then(([o]) => o);

      await Message.create(
        [
          {
            listing: listing._id,
            thread: thread._id,
            sender: user._id,
            type: "offer",
            offer: offer._id,
            offerSnapshot: {
              amount_cents,
              shipping_cents,
              tax_cents,
              total_cents,
              listingPrice: listing.price,
            },
            readBy: [{ user: user._id, at: new Date() }],
          },
        ],
        { session }
      );

      thread.lastMessageAt = new Date();
      await thread.save({ session });
    });

    res.status(201).json({
      message: "Offer created (funds held in escrow)",
      offer,
      threadId: thread._id,
    });
  } finally {
    session.endSession();
  }
});

export const acceptOffer = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?._id) throw createError("Unauthorized", 401);

  const offer = await Offer.findById(id).populate("listing");
  if (!offer) throw createError("Offer not found", 404);
  if (String(offer.seller) !== String(user._id))
    throw createError("Forbidden", 403);
  if (offer.status !== "pending")
    throw createError("Offer already processed", 400);
  if (!offer.fundsHeld) throw createError("Offer is not backed by funds", 400);

  const listing = offer.listing;
  if (listing.isSold || listing.isDeleted || listing.isDraft)
    throw createError("Listing unavailable", 400);

  const session = await mongoose.startSession();
  let order, thread;

  try {
    await session.withTransaction(async () => {
      const updatedListing = await Listing.findOneAndUpdate(
        { _id: listing._id, isSold: false },
        { isSold: true, buyer: offer.buyer },
        { new: true, session }
      );
      if (!updatedListing) throw createError("Listing already sold", 409);

      thread = await Thread.findOne({
        listing: listing._id,
        buyer: offer.buyer,
        seller: offer.seller,
      }).session(session);

      const now = new Date();
      const price = {
        listingPrice: offer.amount_cents / 100,
        shipping: offer.shipping_cents / 100,
        tax: offer.tax_cents / 100,
        total: offer.total_cents / 100,
      };

      order = await Order.create(
        [
          {
            listing: listing._id,
            buyer: offer.buyer,
            seller: offer.seller,
            status: "PAID",
            statusHistory: [{ status: "PAID", updatedAt: now }],
            shippingAddress: offer.shippingAddress || null,
            shippingFrom: `${listing.shippingFrom.city}, ${listing.shippingFrom.state}`,
            price,
            total_cents: offer.total_cents,
            currency: "USD",
            paymentMethod: "Credit",
            listingSnapshot: {
              title: listing.title,
              designer: listing.designer,
              size: listing.size,
              price_cents: Math.round(listing.price * 100),
              imageUrl: listing.thumbnail || listing.images?.[0] || "",
            },
            orderId: new mongoose.Types.ObjectId().toString(),
            escrow: {
              cents: offer.total_cents,
              status: "HELD",
              releasedAt: null,
            },
            thread: thread?._id || null,
          },
        ],
        { session }
      ).then(([o]) => o);

      offer.status = "accepted";
      offer.respondedAt = now;
      await offer.save({ session });

      await Message.create(
        [
          {
            listing: listing._id,
            thread: thread?._id || null,
            type: "system",
            system: {
              event: "order_created",
              data: {
                orderId: order._id,
                offerId: offer._id,
                total_cents: order.total_cents,
                title: order.listingSnapshot.title,
                size: order.listingSnapshot.size,
              },
            },
            readBy: [{ user: user._id, at: now }],
          },
        ],
        { session }
      );

      if (thread) {
        thread.lastMessageAt = now;
        await thread.save({ session });
      }
    });

    res.json({
      message: "Offer accepted — order created (escrow held)",
      orderId: order._id,
      order,
    });
  } finally {
    session.endSession();
  }
});

export const declineOffer = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  if (!user?._id) throw createError("Unauthorized", 401);

  const offer = await Offer.findById(id);
  if (!offer) throw createError("Offer not found", 404);
  if (String(offer.seller) !== String(user._id))
    throw createError("Forbidden", 403);
  if (offer.status !== "pending")
    throw createError("Offer already processed", 400);

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      if (offer.fundsHeld) {
        await User.updateOne(
          { _id: offer.buyer },
          { $inc: { virtualBalanceCents: +offer.total_cents } },
          { session }
        );
        offer.fundsHeld = false;
      }

      offer.status = "declined";
      offer.respondedAt = new Date();
      await offer.save({ session });

      const thread = await Thread.findOne({
        listing: offer.listing,
        buyer: offer.buyer,
        seller: offer.seller,
      }).session(session);

      await Message.create(
        [
          {
            listing: offer.listing,
            thread: thread?._id || null,
            sender: user._id,
            type: "system",
            system: { event: "offer_declined", data: { offerId: offer._id } },
            readBy: [{ user: user._id, at: new Date() }],
          },
        ],
        { session }
      );

      if (thread) {
        thread.lastMessageAt = new Date();
        await thread.save({ session });
      }
    });

    res.json({ message: "Offer declined — funds released", offer });
  } finally {
    session.endSession();
  }
});
