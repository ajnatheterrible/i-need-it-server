import mongoose from "mongoose";
import Offer from "../models/Offer.js";
import Listing from "../models/Listing.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Thread from "../models/Thread.js";
import Order from "../models/Order.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";
import { upsertListingToMeili } from "../meili/meiliSync.js";

const toId = (v) => (v && typeof v === "object" ? v._id || v.id : v);

const populateOfferMessage = async (messageId) => {
  return Message.findById(messageId)
    .populate("sender", "username")
    .populate("actor", "username")
    .populate({
      path: "offer",
      populate: [
        { path: "buyer", select: "username virtualBalanceCents" },
        { path: "seller", select: "username" },
        {
          path: "listing",
          select:
            "title designer price size thumbnail images shippingRegions isFreeShipping shippingFrom seller favoritesCount",
          populate: [{ path: "seller", select: "username" }],
        },
      ],
    });
};

const getUSShippingCents = (listing) => {
  if (listing.isFreeShipping) return 0;
  const region = (listing.shippingRegions || []).find(
    (r) => r.region === "United States" && r.enabled
  );
  if (!region)
    throw createError("Shipping not available to selected region", 400);
  const shipping = Number(region.cost || 0);
  return Math.round(shipping * 100);
};

const DEFAULT_EXPIRES_MS = 24 * 60 * 60 * 1000;

export const createOffer = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user?._id) throw createError("Unauthorized", 401);

  const { listingId, amount, shippingAddress, tax = 0, message } = req.body;
  if (!listingId || amount == null || !shippingAddress)
    throw createError("Missing required fields", 400);

  const listing = await Listing.findById(listingId);
  if (!listing) throw createError("Listing not found", 404);
  if (listing.isSold || listing.isDeleted || listing.isDraft)
    throw createError("Listing unavailable", 400);
  if (String(listing.seller) === String(user._id))
    throw createError("You cannot make offers on your own listing", 403);

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0)
    throw createError("Enter a valid amount", 400);

  const listPrice_cents = Math.round(Number(listing.price) * 100);
  const amount_cents = Math.round(amountNum * 100);

  const minBuyer_cents = Math.ceil(listPrice_cents * 0.6);
  if (amount_cents < minBuyer_cents)
    throw createError(
      `Offer must be at least $${(minBuyer_cents / 100).toFixed(0)}`,
      400
    );
  if (amount_cents > listPrice_cents)
    throw createError("Offer cannot exceed listing price", 400);

  const alreadyPending = await Offer.exists({
    listing: listing._id,
    buyer: user._id,
    seller: listing.seller,
    mode: "buyer",
    status: "pending",
  });
  if (alreadyPending)
    throw createError("You already have a pending offer on this listing", 409);

  const shipping_cents = getUSShippingCents(listing);
  const tax_cents = Math.round(Number(tax) * 100);
  const total_cents = amount_cents + shipping_cents + tax_cents;

  if ((user.virtualBalanceCents || 0) < total_cents)
    throw createError("Insufficient funds to back offer", 400);

  const expiresAt =
    req.body.expiresAt != null
      ? new Date(req.body.expiresAt)
      : new Date(Date.now() + DEFAULT_EXPIRES_MS);

  if (Number.isNaN(expiresAt.getTime()))
    throw createError("Invalid expiresAt", 400);

  const session = await mongoose.startSession();
  let offer, thread, offerMessage;

  try {
    await session.withTransaction(async () => {
      const debitRes = await User.updateOne(
        { _id: user._id, virtualBalanceCents: { $gte: total_cents } },
        { $inc: { virtualBalanceCents: -total_cents } },
        { session }
      );
      if (debitRes.modifiedCount !== 1)
        throw createError("Insufficient funds to back offer", 400);

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
            mode: "buyer",
            amount_cents,
            shipping_cents,
            tax_cents,
            total_cents,
            status: "pending",
            fundsHeld: true,
            expiresAt,
            shippingAddress,
          },
        ],
        { session }
      ).then(([o]) => o);

      offerMessage = await Message.create(
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
              status: "pending",
            },
            system: { data: { buyer: user._id, seller: listing.seller } },
            readBy: [{ user: user._id, at: new Date() }],
          },
        ],
        { session }
      ).then(([m]) => m);

      thread.lastMessage = offerMessage._id;
      thread.lastMessageAt = offerMessage.createdAt;
      await thread.save({ session });
    });

    const populatedMsg = await populateOfferMessage(offerMessage._id);

    res.status(201).json({
      message: "Offer created (funds held in escrow)",
      offer,
      threadId: thread._id,
      offerMessage: populatedMsg,
    });
  } finally {
    session.endSession();
  }
});

export const createSellerPrivateOffer = asyncHandler(async (req, res) => {
  const user = req.user;
  const { listingId } = req.params;
  const { buyerId, amount } = req.body;

  if (!user?._id) throw createError("Unauthorized", 401);
  if (!buyerId || !listingId || amount == null)
    throw createError("Missing required fields", 400);

  const listing = await Listing.findById(listingId);
  if (!listing) throw createError("Listing not found", 404);
  if (listing.isSold || listing.isDeleted || listing.isDraft)
    throw createError("Listing unavailable", 400);
  if (String(listing.seller) !== String(user._id))
    throw createError("Forbidden", 403);
  if (String(buyerId) === String(user._id))
    throw createError("You cannot send an offer to yourself", 400);

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum < 1)
    throw createError("Offer must be at least $1", 400);

  const amount_cents = Math.round(amountNum * 100);
  const listPrice_cents = Math.round(Number(listing.price) * 100);

  if (amount_cents > listPrice_cents)
    throw createError("Offer cannot exceed listing price", 400);

  const dupPending = await Offer.exists({
    listing: listing._id,
    buyer: buyerId,
    seller: user._id,
    mode: "seller_private",
    status: "pending",
  });
  if (dupPending)
    throw createError(
      "You already have a pending private offer to this buyer",
      409
    );

  let thread =
    (await Thread.findOne({
      listing: listing._id,
      buyer: buyerId,
      seller: user._id,
    })) ||
    (await Thread.create({
      listing: listing._id,
      buyer: buyerId,
      seller: user._id,
      lastMessageAt: new Date(),
    }));

  const offer = await Offer.create({
    listing: listing._id,
    buyer: buyerId,
    seller: user._id,
    mode: "seller_private",
    amount_cents,
    shipping_cents: 0,
    tax_cents: 0,
    total_cents: amount_cents,
    status: "pending",
    fundsHeld: false,
    expiresAt: new Date(Date.now() + DEFAULT_EXPIRES_MS),
  });

  const msg = await Message.create({
    listing: listing._id,
    thread: thread._id,
    sender: user._id,
    type: "offer",
    offer: offer._id,
    offerSnapshot: {
      amount_cents,
      shipping_cents: 0,
      tax_cents: 0,
      total_cents: amount_cents,
      status: "pending",
    },
    system: { data: { seller: user._id, buyer: buyerId } },
    readBy: [{ user: user._id, at: new Date() }],
  });

  thread.lastMessage = msg._id;
  thread.lastMessageAt = msg.createdAt;
  await thread.save();

  const populatedMsg = await populateOfferMessage(msg._id);

  res.status(201).json({
    message: "Seller private offer created",
    offerMessage: populatedMsg,
    offer,
    threadId: thread._id,
  });
});

export const broadcastOffers = asyncHandler(async (req, res) => {
  const user = req.user;
  const { listingId } = req.params;
  const { amount } = req.body;

  if (!user?._id) throw createError("Unauthorized", 401);
  if (!listingId || amount == null)
    throw createError("Missing required fields", 400);

  const listing = await Listing.findById(listingId).populate("seller", "_id");
  if (!listing) throw createError("Listing not found", 404);
  if (listing.isSold || listing.isDeleted || listing.isDraft)
    throw createError("Listing unavailable", 400);
  if (String(listing.seller._id) !== String(user._id))
    throw createError("Forbidden", 403);

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum < 1)
    throw createError("Offer must be at least $1", 400);

  const amount_cents = Math.round(amountNum * 100);
  const original_cents = Math.round(Number(listing.price) * 100);
  const maxFirstWave = Math.floor(original_cents * 0.9);

  const broadcasts = await Offer.find({
    listing: listing._id,
    seller: user._id,
    mode: "seller_broadcast",
  }).sort({ createdAt: 1 });

  const wavePrices = [...new Set(broadcasts.map((o) => o.amount_cents))];
  const maxWaves = 3;
  const hasPending = broadcasts.some((o) => o.status === "pending");

  if (hasPending)
    throw createError(
      "You already have an active broadcast offer. You can send another after it expires.",
      400
    );

  if (wavePrices.length >= maxWaves)
    throw createError(
      "You’ve used all 3 broadcast offers for this listing.",
      400
    );

  if (wavePrices.length === 0) {
    if (amount_cents > maxFirstWave)
      throw createError(
        "Your first broadcast offer must be at least 10% below the listing price.",
        400
      );
  } else {
    const last = wavePrices[wavePrices.length - 1];
    const requiredMax = Math.floor(last * 0.9);
    if (amount_cents > requiredMax)
      throw createError(
        "Each new broadcast offer must be at least 10% lower than your previous broadcast.",
        400
      );
  }

  const favoriters = await User.find({ favorites: listingId }).select("_id");
  if (!favoriters.length) {
    return res.json({
      success: true,
      count: 0,
      broadcastsRemaining: maxWaves - wavePrices.length,
      results: [],
    });
  }

  let count = 0;
  const results = [];

  for (const fav of favoriters) {
    if (String(fav._id) === String(user._id)) continue;

    let thread =
      (await Thread.findOne({
        listing: listing._id,
        buyer: fav._id,
        seller: user._id,
      })) ||
      (await Thread.create({
        listing: listing._id,
        buyer: fav._id,
        seller: user._id,
        lastMessageAt: new Date(),
      }));

    const offer = await Offer.create({
      listing: listing._id,
      buyer: fav._id,
      seller: user._id,
      mode: "seller_broadcast",
      amount_cents,
      shipping_cents: 0,
      tax_cents: 0,
      total_cents: amount_cents,
      status: "pending",
      fundsHeld: false,
      expiresAt: new Date(Date.now() + DEFAULT_EXPIRES_MS),
    });

    const msg = await Message.create({
      thread: thread._id,
      listing: listing._id,
      sender: user._id,
      type: "offer",
      offer: offer._id,
      offerSnapshot: {
        amount_cents,
        shipping_cents: 0,
        tax_cents: 0,
        total_cents: amount_cents,
        status: "pending",
      },
      system: { data: { seller: user._id, buyer: fav._id } },
      readBy: [{ user: user._id, at: new Date() }],
    });

    thread.lastMessage = msg._id;
    thread.lastMessageAt = msg.createdAt;
    await thread.save();

    count++;
    results.push({ buyer: fav._id, offerId: offer._id });
  }

  const broadcastsRemaining = maxWaves - (wavePrices.length + 1);

  res.json({
    success: true,
    count,
    broadcastsRemaining,
    results,
  });
});

export const getBroadcastStatus = asyncHandler(async (req, res) => {
  const user = req.user;
  const { listingId } = req.params;

  if (!user?._id) throw createError("Unauthorized", 401);

  const listing = await Listing.findById(listingId);
  if (!listing) throw createError("Listing not found", 404);
  if (String(listing.seller) !== String(user._id))
    throw createError("Forbidden", 403);

  const offers = await Offer.find({
    listing: listing._id,
    seller: user._id,
    mode: "seller_broadcast",
  }).sort({ createdAt: 1 });

  const wavePrices = Array.from(new Set(offers.map((o) => o.amount_cents)));
  const lastWavePrice =
    wavePrices.length > 0 ? wavePrices[wavePrices.length - 1] : null;

  const hasPending = offers.some((o) => o.status === "pending");

  const maxWaves = 3;
  const broadcastsRemaining = Math.max(0, maxWaves - wavePrices.length);

  res.json({
    hasPending,
    broadcastsRemaining,
    lastWavePrice,
  });
});

export const acceptOffer = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  if (!user?._id) throw createError("Unauthorized", 401);

  const offer = await Offer.findById(id).populate("listing");
  if (!offer) throw createError("Offer not found", 404);

  if (offer.status !== "pending")
    throw createError("Offer already processed", 400);

  const now = new Date();
  if (offer.expiresAt && offer.expiresAt <= now) {
    offer.status = "expired";
    offer.respondedAt = now;
    offer.fundsHeld = false;
    await offer.save();

    const offerMsg = await Message.findOne({
      offer: offer._id,
      type: "offer",
    });
    if (offerMsg) {
      offerMsg.offerSnapshot.status = "expired";
      await offerMsg.save();
    }

    if (offer.mode === "buyer" && offer.fundsHeld) {
      await User.updateOne(
        { _id: offer.buyer },
        { $inc: { virtualBalanceCents: offer.total_cents } }
      );
    }

    throw createError("Offer expired", 400);
  }

  const listing = offer.listing;
  if (!listing) throw createError("Listing not found", 404);
  if (listing.isSold)
    throw createError("Listing already sold or unavailable", 400);

  if (offer.mode === "buyer") {
    if (String(offer.seller) !== String(user._id))
      throw createError("Forbidden", 403);
    if (!offer.fundsHeld)
      throw createError("Offer is not backed by funds", 400);
    return finalizeOrderForBuyerOffer(offer, listing, user, res);
  }

  if (offer.mode === "seller_private" || offer.mode === "seller_broadcast") {
    if (String(offer.buyer) !== String(user._id))
      throw createError("Forbidden", 403);

    const { shippingAddress, tax = 0, paymentMethod } = req.body;
    if (!shippingAddress) throw createError("Shipping address required", 400);
    if (paymentMethod !== "credit")
      throw createError("Earned credit required to accept this offer", 400);

    return finalizeOrderForSellerOffer(
      offer,
      listing,
      user,
      tax,
      shippingAddress,
      res
    );
  }

  throw createError("Unsupported offer mode", 500);
});

export const declineOffer = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  if (!user?._id) throw createError("Unauthorized", 401);

  const offer = await Offer.findById(id);
  if (!offer) throw createError("Offer not found", 404);
  if (offer.status !== "pending")
    throw createError("Offer already handled", 400);

  if (offer.mode === "buyer") {
    if (String(offer.seller) !== String(user._id))
      throw createError("Forbidden", 403);
  }

  if (offer.mode === "seller_private" || offer.mode === "seller_broadcast") {
    if (String(offer.buyer) !== String(user._id))
      throw createError("Forbidden", 403);
  }

  if (offer.mode === "buyer" && offer.fundsHeld) {
    await User.updateOne(
      { _id: offer.buyer },
      { $inc: { virtualBalanceCents: offer.total_cents } }
    );
    offer.fundsHeld = false;
  }

  offer.status = "declined";
  offer.respondedAt = new Date();
  await offer.save();

  const existingMessage = await Message.findOne({
    offer: offer._id,
    type: "offer",
  });

  let updatedMessage = null;

  if (existingMessage) {
    existingMessage.offerSnapshot.status = "declined";
    await existingMessage.save();
    updatedMessage = await populateOfferMessage(existingMessage._id);
  }

  res.json({
    message: "Offer declined",
    offerId: offer._id,
    updatedMessage,
  });
});

async function finalizeOrderForBuyerOffer(offer, listing, user, res) {
  const now = new Date();

  const thread =
    (await Thread.findOne({
      listing: listing._id,
      buyer: offer.buyer,
      seller: offer.seller,
    })) ||
    (await Thread.create({
      listing: listing._id,
      buyer: offer.buyer,
      seller: offer.seller,
      lastMessageAt: now,
    }));

  const order = await Order.create({
    listing: listing._id,
    buyer: offer.buyer,
    seller: offer.seller,
    status: "PAID",
    statusHistory: [{ status: "PAID", updatedAt: now }],
    shippingAddress: offer.shippingAddress,
    shippingFrom: `${listing.shippingFrom.city}, ${listing.shippingFrom.state}`,
    price: {
      listingPrice: offer.amount_cents / 100,
      shipping: offer.shipping_cents / 100,
      tax: offer.tax_cents / 100,
      total: offer.total_cents / 100,
    },
    total_cents: offer.total_cents,
    orderId: new mongoose.Types.ObjectId().toString(),
    escrow: { cents: offer.total_cents, status: "HELD" },
    thread: thread._id,
  });

  const offerMsg = await Message.findOne({
    offer: offer._id,
    type: "offer",
  });

  if (offerMsg) {
    offerMsg.offerSnapshot.status = "accepted";
    await offerMsg.save();
  }

  offer.status = "accepted";
  offer.respondedAt = now;
  await offer.save();

  const [orderMessage] = await Message.create([
    {
      listing: listing._id,
      thread: thread._id,
      type: "system",
      system: {
        event: "order_created",
        data: {
          orderId: order._id,
          total_cents: order.total_cents,
          title: listing.title,
          size: listing.size,
          buyer: offer.buyer,
          seller: offer.seller,
        },
      },
      readBy: [{ user: user._id, at: now }],
    },
  ]);

  thread.lastMessage = orderMessage._id;
  thread.lastMessageAt = orderMessage.createdAt;
  await thread.save();

  listing.isSold = true;
  listing.buyer = offer.buyer;
  await listing.save();

  await upsertListingToMeili(listing);

  const updatedMessage = offerMsg
    ? await populateOfferMessage(offerMsg._id)
    : null;

  res.json({
    order,
    updatedMessage,
    orderMessage,
  });
}

async function finalizeOrderForSellerOffer(
  offer,
  listing,
  user,
  tax,
  shippingAddress,
  res
) {
  const now = new Date();

  const amount_cents = offer.amount_cents;
  const shipping_cents = getUSShippingCents(listing);
  const tax_cents = Math.round(Number(tax) * 100);
  const total_cents = amount_cents + shipping_cents + tax_cents;

  const buyer = await User.findById(offer.buyer).select("virtualBalanceCents");
  if (!buyer) throw createError("Buyer not found", 404);

  if ((buyer.virtualBalanceCents || 0) < total_cents)
    throw createError("Insufficient funds to complete purchase", 400);

  const session = await mongoose.startSession();
  let order, orderMessage, updatedMessage;

  try {
    await session.withTransaction(async () => {
      const debitRes = await User.updateOne(
        { _id: offer.buyer, virtualBalanceCents: { $gte: total_cents } },
        { $inc: { virtualBalanceCents: -total_cents } },
        { session }
      );
      if (debitRes.modifiedCount !== 1)
        throw createError("Insufficient funds to complete purchase", 400);

      let thread =
        (await Thread.findOne({
          listing: listing._id,
          buyer: offer.buyer,
          seller: offer.seller,
        }).session(session)) ||
        (await Thread.create(
          [
            {
              listing: listing._id,
              buyer: offer.buyer,
              seller: offer.seller,
              lastMessageAt: now,
            },
          ],
          { session }
        ).then(([t]) => t));

      offer.shipping_cents = shipping_cents;
      offer.tax_cents = tax_cents;
      offer.total_cents = total_cents;
      offer.shippingAddress = shippingAddress;
      offer.fundsHeld = true;
      offer.status = "accepted";
      offer.respondedAt = now;
      await offer.save({ session });

      const offerMsg = await Message.findOne({
        offer: offer._id,
        type: "offer",
      }).session(session);

      if (offerMsg) {
        offerMsg.offerSnapshot.status = "accepted";
        offerMsg.offerSnapshot.shipping_cents = shipping_cents;
        offerMsg.offerSnapshot.tax_cents = tax_cents;
        offerMsg.offerSnapshot.total_cents = total_cents;
        await offerMsg.save({ session });
      }

      order = await Order.create(
        [
          {
            listing: listing._id,
            buyer: offer.buyer,
            seller: offer.seller,
            status: "PAID",
            statusHistory: [{ status: "PAID", updatedAt: now }],
            shippingAddress,
            shippingFrom: `${listing.shippingFrom.city}, ${listing.shippingFrom.state}`,
            price: {
              listingPrice: amount_cents / 100,
              shipping: shipping_cents / 100,
              tax: tax_cents / 100,
              total: total_cents / 100,
            },
            total_cents,
            orderId: new mongoose.Types.ObjectId().toString(),
            escrow: { cents: total_cents, status: "HELD" },
            thread: thread._id,
          },
        ],
        { session }
      ).then(([o]) => o);

      [orderMessage] = await Message.create(
        [
          {
            listing: listing._id,
            thread: thread._id,
            type: "system",
            system: {
              event: "order_created",
              data: {
                orderId: order._id,
                total_cents,
                title: listing.title,
                size: listing.size,
                buyer: offer.buyer,
                seller: offer.seller,
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

      listing.isSold = true;
      listing.buyer = offer.buyer;
      await listing.save({ session });

      updatedMessage = offerMsg
        ? await populateOfferMessage(offerMsg._id)
        : null;
    });

    await upsertListingToMeili(listing);

    res.json({
      order,
      updatedMessage,
      orderMessage,
    });
  } finally {
    session.endSession();
  }
}

export const getActiveSellerOfferForListing = asyncHandler(async (req, res) => {
  const user = req.user;
  const { listingId } = req.params;

  if (!user?._id) throw createError("Unauthorized", 401);
  if (!listingId) throw createError("Missing listing ID", 400);

  const listing = await Listing.findById(listingId).select(
    "seller isSold isDeleted isDraft"
  );
  if (!listing) throw createError("Listing not found", 404);

  if (
    listing.isSold ||
    listing.isDeleted ||
    listing.isDraft ||
    String(listing.seller) === String(user._id)
  ) {
    return res.json({ offer: null });
  }

  const now = new Date();

  const offer = await Offer.findOne({
    listing: listing._id,
    buyer: user._id,
    seller: listing.seller,
    mode: { $in: ["seller_private", "seller_broadcast"] },
    status: "pending",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ createdAt: -1 })
    .select("_id mode amount_cents total_cents expiresAt createdAt");

  res.json({ offer });
});
