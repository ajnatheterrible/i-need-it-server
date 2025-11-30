import Offer from "../models/Offer.js";
import Thread from "../models/Thread.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import createError from "../utils/createError.js";

export const createOfferAndMessage = async (
  user,
  listing,
  buyerId,
  sellerId,
  amount,
  tax = 0
) => {
  if (!listing?._id) throw createError("Listing not found", 404);

  await Offer.updateMany(
    {
      listing: listing._id,
      expiresAt: { $lte: new Date() },
      status: "pending",
    },
    { $set: { status: "expired", fundsHeld: false, respondedAt: new Date() } }
  );

  const existingOffer = await Offer.findOne({
    listing: listing._id,
    buyer: buyerId,
    seller: sellerId,
    status: "pending",
  });
  if (existingOffer) throw createError("A pending offer already exists", 400);

  const PERCENT_FLOOR = 0.6;
  const minAllowed = listing.price * PERCENT_FLOOR;

  if (Number(amount) < minAllowed)
    throw createError(
      `Offers must be at least $${minAllowed.toFixed(
        2
      )} (no more than 40% off the listing price)`,
      400
    );
  if (Number(amount) > listing.price)
    throw createError("Offer cannot exceed the listing price", 400);

  const amount_cents = Math.round(Number(amount) * 100);
  const tax_cents = Math.round(Number(tax) * 100);
  const total_cents = amount_cents + tax_cents;

  const buyer = await User.findById(buyerId);
  if (!buyer) throw createError("Buyer not found", 404);
  if (buyer.virtualBalanceCents < total_cents)
    throw createError("Insufficient funds to submit offer", 400);

  buyer.virtualBalanceCents -= total_cents;
  await buyer.save();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const initiatedBy =
    String(user._id) === String(sellerId) ? "seller" : "buyer";

  const existingThread =
    (await Thread.findOne({
      listing: listing._id,
      buyer: buyerId,
      seller: sellerId,
    })) ||
    (await Thread.create({
      listing: listing._id,
      buyer: buyerId,
      seller: sellerId,
    }));

  const offer = await Offer.create({
    listing: listing._id,
    buyer: buyerId,
    seller: sellerId,
    amount_cents,
    tax_cents,
    total_cents,
    expiresAt,
    initiatedBy,
    status: "pending",
    fundsHeld: true,
  });

  const msg = await Message.create({
    type: "system",
    thread: existingThread._id,
    listing: listing._id,
    offer: offer._id,
    actor: user._id,
    offerSnapshot: {
      amount_cents,
      tax_cents,
      total_cents,
      status: offer.status,
      createdAt: offer.createdAt,
    },
    system: { event: "offer_created" },
  });

  const populated = await Message.findById(msg._id)
    .populate("actor", "username")
    .populate({
      path: "offer",
      select: "buyer seller expiresAt status respondedAt initiatedBy",
      populate: [
        { path: "buyer", select: "username" },
        { path: "seller", select: "username" },
      ],
    })
    .lean();

  return populated;
};
