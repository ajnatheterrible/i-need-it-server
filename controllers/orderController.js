import mongoose from "mongoose";
import client from "../meili/meili.js";
import Listing from "../models/Listing.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Thread from "../models/Thread.js";
import Platform from "../models/Platform.js";
import Offer from "../models/Offer.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";
import { upsertListingToMeili } from "../meili/meiliSync.js";

const genTracking = () =>
  `IN${Math.random().toString().slice(2, 10)}US${Date.now()
    .toString()
    .slice(-4)}`;

export const purchaseListing = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user || !user._id) throw createError("Unauthorized", 401);

  const { listingId, shippingAddress, tax = 0 } = req.body;
  if (!listingId || !shippingAddress)
    throw createError("Missing required fields", 400);

  const listing = await Listing.findById(listingId);
  if (!listing) throw createError("Listing not found", 404);
  if (
    listing.isSold ||
    listing.isDeleted ||
    listing.isArchived ||
    listing.isDraft
  )
    throw createError("Listing is not available for purchase", 400);
  if (String(listing.seller) === String(user._id))
    throw createError("You cannot purchase your own listing", 403);

  const now = new Date();

  const region = listing.shippingRegions.find(
    (r) => r.region === "United States" && r.enabled
  );
  if (!region)
    throw createError("Shipping not available to selected region", 400);

  const appliedOffer = await Offer.findOne({
    listing: listing._id,
    buyer: user._id,
    seller: listing.seller,
    mode: { $in: ["seller_private", "seller_broadcast"] },
    status: "pending",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).sort({ createdAt: -1 });

  const shipping = listing.isFreeShipping ? 0 : Number(region.cost || 0);
  const shipping_cents = Math.round(shipping * 100);
  const listingPrice = appliedOffer
    ? appliedOffer.amount_cents / 100
    : Number(listing.price);
  const taxAmount = Number(tax || 0);
  const tax_cents = Math.round(taxAmount * 100);
  const total = listingPrice + shipping + taxAmount;
  const total_cents = Math.round(total * 100);

  if ((user.virtualBalanceCents || 0) < total_cents)
    throw createError("Insufficient credit to complete purchase", 400);

  const session = await mongoose.startSession();
  let updatedListing, order, thread;

  try {
    await session.withTransaction(async () => {
      updatedListing = await Listing.findOneAndUpdate(
        { _id: listingId, isSold: false },
        { isSold: true, buyer: user._id },
        { session, new: true }
      );
      if (!updatedListing) throw createError("Listing already sold", 409);

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
      if (existingOrder) throw createError("Duplicate order attempt", 409);

      thread =
        (await Thread.findOne({
          listing: updatedListing._id,
          buyer: user._id,
          seller: updatedListing.seller,
        }).session(session)) ||
        (await Thread.create(
          [
            {
              listing: updatedListing._id,
              buyer: user._id,
              seller: updatedListing.seller,
              lastMessageAt: now,
            },
          ],
          { session }
        ).then(([t]) => t));

      [order] = await Order.create(
        [
          {
            listing: updatedListing._id,
            buyer: user._id,
            seller: updatedListing.seller,
            status: "PAID",
            statusHistory: [{ status: "PAID", updatedAt: now }],
            shippingAddress,
            shippingFrom: `${updatedListing.shippingFrom.city}, ${updatedListing.shippingFrom.state}`,
            price: {
              listingPrice,
              shipping,
              tax: taxAmount,
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
            escrow: { cents: total_cents, status: "HELD", releasedAt: null },
            thread: thread._id,
          },
        ],
        { session }
      );

      const [orderMessage] = await Message.create(
        [
          {
            listing: updatedListing._id,
            thread: thread._id,
            type: "system",
            system: {
              event: "order_created",
              data: {
                orderId: order._id,
                total_cents: order.total_cents,
                title: updatedListing.title,
                size: updatedListing.size,
                buyer: user._id,
                seller: updatedListing.seller,
              },
            },
            readBy: [{ user: user._id, at: now }],
          },
        ],
        { session }
      );

      thread.lastMessage = orderMessage._id;
      thread.lastMessageAt = orderMessage.createdAt;
      await thread.save({ session });

      if (appliedOffer) {
        const offerForUpdate = await Offer.findOne({
          _id: appliedOffer._id,
          status: "pending",
        }).session(session);

        if (offerForUpdate) {
          offerForUpdate.shipping_cents = shipping_cents;
          offerForUpdate.tax_cents = tax_cents;
          offerForUpdate.total_cents = total_cents;
          offerForUpdate.shippingAddress = shippingAddress;
          offerForUpdate.status = "accepted";
          offerForUpdate.respondedAt = now;
          offerForUpdate.fundsHeld = true;
          await offerForUpdate.save({ session });

          const offerMsg = await Message.findOne({
            offer: offerForUpdate._id,
            type: "offer",
          }).session(session);

          if (offerMsg) {
            offerMsg.offerSnapshot.status = "accepted";
            offerMsg.offerSnapshot.shipping_cents = shipping_cents;
            offerMsg.offerSnapshot.tax_cents = tax_cents;
            offerMsg.offerSnapshot.total_cents = total_cents;
            await offerMsg.save({ session });
          }
        }
      }
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
  if (!isBuyer && !isSeller) throw createError("Forbidden", 403);

  res.status(200).json(order);
});

export const simulateOrderStatus = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;
  const user = req.user;
  if (!user?._id) throw createError("Unauthorized", 401);
  if (!orderId) throw createError("Missing order ID", 400);

  const session = await mongoose.startSession();

  try {
    let updatedOrder;
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw createError("Order not found", 404);

      const isBuyer = String(order.buyer) === String(user._id);
      const isSeller = String(order.seller) === String(user._id);
      if (!isBuyer && !isSeller) throw createError("Forbidden", 403);

      if (!order.thread) {
        const t = await Thread.findOne({
          listing: order.listing,
          buyer: order.buyer,
          seller: order.seller,
        }).session(session);
        if (t) {
          order.thread = t._id;
          await order.save({ session });
        }
      }

      const wasRefunded = !!order.refund && !!order.refund.issuedAt;
      const wasDelivered =
        order.status === "DELIVERED" ||
        order.statusHistory?.some((h) => h.status === "DELIVERED");

      if (wasRefunded && !wasDelivered) {
        updatedOrder = order;
        return;
      }

      const flow = ["PAID", "SHIPPED", "DELIVERED"];
      const currentIndex = flow.indexOf(order.status);
      if (currentIndex === -1) throw createError("Invalid order status", 409);
      if (currentIndex === flow.length - 1) {
        updatedOrder = order;
        return;
      }

      const now = new Date();
      for (let i = currentIndex + 1; i < flow.length; i++) {
        const nextStatus = flow[i];
        order.status = nextStatus;
        order.statusHistory.push({ status: nextStatus, updatedAt: now });

        if (nextStatus === "SHIPPED") {
          if (!order.trackingNumber) order.trackingNumber = genTracking();
          const exists = await Message.exists({
            type: "system",
            "system.event": "order_shipped",
            "system.data.orderId": order._id,
          }).session(session);
          if (!exists) {
            const [msg] = await Message.create(
              [
                {
                  listing: order.listing,
                  thread: order.thread,
                  type: "system",
                  system: {
                    event: "order_shipped",
                    data: {
                      orderId: order._id,
                      trackingNumber: order.trackingNumber,
                      buyer: order.buyer,
                      seller: order.seller,
                    },
                  },
                  readBy: [{ user: user._id, at: now }],
                },
              ],
              { session }
            );
            if (order.thread) {
              await Thread.findByIdAndUpdate(
                order.thread,
                { lastMessage: msg._id, lastMessageAt: msg.createdAt },
                { session }
              );
            }
          }
        }

        if (nextStatus === "DELIVERED" && order.escrow?.status === "HELD") {
          const listingCents = Math.round(
            (order.price?.listingPrice || 0) * 100
          );
          const shippingCents = Math.round((order.price?.shipping || 0) * 100);
          const taxCents = Math.round((order.price?.tax || 0) * 100);
          const fee = Math.round(listingCents * 0.09);
          const sellerNet = Math.max(
            0,
            listingCents - fee - shippingCents - taxCents
          );

          const deliveredExists = await Message.exists({
            type: "system",
            "system.event": "order_delivered",
            "system.data.orderId": order._id,
          }).session(session);

          if (!deliveredExists) {
            const [deliveredMsg] = await Message.create(
              [
                {
                  listing: order.listing,
                  thread: order.thread,
                  type: "system",
                  system: {
                    event: "order_delivered",
                    data: {
                      orderId: order._id,
                      buyer: order.buyer,
                      seller: order.seller,
                      trackingNumber: order.trackingNumber || null,
                    },
                  },
                  readBy: [{ user: user._id, at: now }],
                },
              ],
              { session }
            );
            if (order.thread) {
              await Thread.findByIdAndUpdate(
                order.thread,
                {
                  lastMessage: deliveredMsg._id,
                  lastMessageAt: deliveredMsg.createdAt,
                },
                { session }
              );
            }
          }

          await User.updateOne(
            { _id: order.seller },
            { $inc: { virtualBalanceCents: sellerNet } },
            { session }
          );

          order.escrow.status = "RELEASED";
          order.escrow.releasedAt = now;

          const payoutExists = await Message.exists({
            type: "system",
            "system.event": "payout_released",
            "system.data.orderId": order._id,
          }).session(session);

          if (!payoutExists) {
            const [payoutMsg] = await Message.create(
              [
                {
                  listing: order.listing,
                  thread: order.thread,
                  type: "system",
                  system: {
                    event: "payout_released",
                    data: {
                      orderId: order._id,
                      buyer: order.buyer,
                      seller: order.seller,
                      fee_cents: fee,
                      net_cents: sellerNet,
                      deductions: { shippingCents, taxCents },
                    },
                  },
                  readBy: [{ user: user._id, at: now }],
                },
              ],
              { session }
            );
            if (order.thread) {
              await Thread.findByIdAndUpdate(
                order.thread,
                {
                  lastMessage: payoutMsg._id,
                  lastMessageAt: payoutMsg.createdAt,
                },
                { session }
              );
            }
          }
        }
      }

      await order.save({ session });
      updatedOrder = order;
    });

    return res
      .status(200)
      .json({ message: "Order fully simulated", order: updatedOrder });
  } finally {
    session.endSession();
  }
});

export const verifyOrderZip = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id: orderId } = req.params;
  const { postalCode } = req.body;

  if (!user?._id) throw createError("Unauthorized", 401);
  if (!orderId || !postalCode)
    throw createError("Missing order ID or postal code", 400);

  const order = await Order.findById(orderId)
    .populate("buyer", "_id")
    .populate("seller", "_id");

  if (!order) throw createError("Order not found", 404);

  const isBuyer = String(order.buyer?._id || order.buyer) === String(user._id);
  const isSeller =
    String(order.seller?._id || order.seller) === String(user._id);
  if (!isBuyer && !isSeller) throw createError("Forbidden", 403);

  const savedZip =
    order.shippingAddress?.zip?.trim()?.toLowerCase() ||
    order.shippingAddress?.postalCode?.trim()?.toLowerCase();
  const enteredZip = postalCode.trim().toLowerCase();

  if (!savedZip) throw createError("No postal code stored for this order", 400);

  if (savedZip === enteredZip) {
    return res.json({ success: true, message: "Postal code verified" });
  }

  return res
    .status(400)
    .json({ success: false, message: "Invalid postal code" });
});

const REFUND_REASONS = [
  "I no longer have this item",
  "I don't ship internationally",
  "I don't want to sell it anymore",
  "It is damaged",
  "Buyer had incorrect address",
  "The buyer requested a refund",
  "I am traveling or busy",
  "Other",
];

const PRE_SHIP_REASONS = [
  "I no longer have this item",
  "I don't ship internationally",
  "I don't want to sell it anymore",
];

export const issueRefund = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id: orderId } = req.params;
  const { mode = "full", amount, reason = "", note = "" } = req.body || {};

  if (!user?._id) throw createError("Unauthorized", 401);
  if (!orderId) throw createError("Missing order ID", 400);

  if (!reason || typeof reason !== "string")
    throw createError("Refund reason is required", 400);
  if (!REFUND_REASONS.includes(reason))
    throw createError("Invalid refund reason", 400);

  const session = await mongoose.startSession();
  let updatedOrder;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw createError("Order not found", 404);

      const isSeller = String(order.seller) === String(user._id);
      if (!isSeller)
        throw createError("Only the seller can issue a refund", 403);

      if (order.refund && order.refund.issuedAt) {
        throw createError("Refund already issued for this order", 400);
      }

      const hasShipped =
        order.status === "SHIPPED" ||
        order.status === "DELIVERED" ||
        order.statusHistory?.some((h) =>
          ["SHIPPED", "DELIVERED"].includes(h.status)
        );

      if (hasShipped && PRE_SHIP_REASONS.includes(reason)) {
        throw createError(
          "This refund reason is only valid before the item has shipped",
          400
        );
      }

      const total_cents = order.total_cents || 0;
      if (total_cents <= 0) throw createError("Nothing to refund", 400);

      let refund_cents;
      if (mode === "full") {
        refund_cents = total_cents;
      } else if (mode === "partial") {
        const parsed = parseFloat(String(amount));
        if (!parsed || parsed <= 0)
          throw createError("Invalid refund amount", 400);
        refund_cents = Math.round(parsed * 100);
        if (refund_cents > total_cents)
          throw createError("Refund amount exceeds total paid", 400);
      } else {
        throw createError("Invalid refund mode", 400);
      }

      const listingPrice = order.price?.listingPrice || 0;
      const shipping = order.price?.shipping || 0;
      const tax = order.price?.tax || 0;
      const listingCents = Math.round(listingPrice * 100);
      const shippingCents = Math.round(shipping * 100);
      const taxCents = Math.round(tax * 100);
      const fee = Math.round(listingCents * 0.09);
      const sellerNet = Math.max(
        0,
        listingCents - fee - shippingCents - taxCents
      );

      const escrowReleased = order.escrow && order.escrow.status === "RELEASED";

      let sellerDebit = 0;
      if (escrowReleased) {
        sellerDebit = Math.min(refund_cents, sellerNet);
      }

      await User.updateOne(
        { _id: order.buyer },
        { $inc: { virtualBalanceCents: refund_cents } },
        { session }
      );

      if (sellerDebit > 0) {
        await User.updateOne(
          { _id: order.seller },
          { $inc: { virtualBalanceCents: -sellerDebit } },
          { session }
        );
      }

      const now = new Date();

      const wasDelivered =
        order.status === "DELIVERED" ||
        order.statusHistory?.some((h) => h.status === "DELIVERED");

      if (!wasDelivered && refund_cents === total_cents) {
        order.status = "CANCELED";
        order.statusHistory.push({ status: "CANCELED", updatedAt: now });
      }

      order.refund = {
        mode,
        amount_cents: refund_cents,
        fee_cents: fee,
        sellerDebit_cents: sellerDebit,
        reason,
        note,
        issuedBy: user._id,
        issuedAt: now,
      };

      const [refundMsg] = await Message.create(
        [
          {
            listing: order.listing,
            thread: order.thread,
            type: "system",
            system: {
              event: "refund_issued",
              data: {
                orderId: order._id,
                buyer: order.buyer,
                seller: order.seller,
                amount_cents: refund_cents,
                mode,
                reason,
              },
            },
            readBy: [{ user: user._id, at: now }],
          },
        ],
        { session }
      );

      if (order.thread) {
        await Thread.findByIdAndUpdate(
          order.thread,
          { lastMessage: refundMsg._id, lastMessageAt: refundMsg.createdAt },
          { session }
        );
      }

      await order.save({ session });
      updatedOrder = order;
    });

    const hydratedOrder = await Order.findById(updatedOrder._id)
      .populate("buyer", "username email")
      .populate("seller", "username email")
      .populate("listing");

    return res.status(200).json({
      message: "Refund issued successfully",
      order: hydratedOrder,
    });
  } finally {
    session.endSession();
  }
});

export const priceDropListing = asyncHandler(async (req, res) => {
  const user = req.user;
  const { listingId, newPrice, discountPercent } = req.body || {};

  if (!user?._id) throw createError("Unauthorized", 401);
  if (!listingId) throw createError("Listing ID is required", 400);

  const listing = await Listing.findById(listingId);
  if (!listing) throw createError("Listing not found", 404);

  if (String(listing.seller) !== String(user._id)) {
    throw createError("You can only edit your own listings", 403);
  }

  if (listing.isSold || listing.isDeleted || listing.isDraft) {
    throw createError("Listing is not active", 400);
  }

  const parsed =
    typeof newPrice === "string" ? parseFloat(newPrice) : Number(newPrice);

  if (!parsed || parsed <= 0) {
    throw createError("A valid new price is required", 400);
  }

  if (parsed >= listing.price) {
    throw createError("New price must be lower than current price", 400);
  }

  if (typeof listing.originalPrice !== "number" || listing.originalPrice <= 0) {
    listing.originalPrice = listing.price;
  }

  const oldPrice = listing.price;
  listing.price = parsed;

  await listing.save();
  await upsertListingToMeili(listing);

  const appliedDiscount =
    typeof discountPercent === "number"
      ? discountPercent
      : Math.round(((oldPrice - parsed) / oldPrice) * 100);

  res.status(200).json({
    message: "Price updated",
    listing,
    discountPercent: appliedDiscount,
  });
});
