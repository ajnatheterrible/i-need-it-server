import Message from "../models/Message.js";
import Thread from "../models/Thread.js";
import Listing from "../models/Listing.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";
import mongoose from "mongoose";

export const sendMessage = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user?._id) throw createError("Unauthorized", 401);

  const { threadId, listingId, content } = req.body;
  if (!content) throw createError("Message content required", 400);

  let thread;

  if (threadId) {
    thread = await Thread.findById(threadId);
  } else {
    const listing = await Listing.findById(listingId);
    if (!listing) throw createError("Listing not found", 404);

    thread =
      (await Thread.findOne({
        listing: listing._id,
        buyer: user._id,
        seller: listing.seller,
      })) ||
      (await Thread.create({
        listing: listing._id,
        buyer: user._id,
        seller: listing.seller,
        lastMessageAt: new Date(),
      }));
  }

  if (!thread) throw createError("Thread not found", 404);

  if (
    String(thread.buyer) !== String(user._id) &&
    String(thread.seller) !== String(user._id)
  ) {
    throw createError("Forbidden", 403);
  }

  const message = await Message.create({
    thread: thread._id,
    listing: thread.listing,
    sender: user._id,
    type: "text",
    content,
    readBy: [{ user: user._id, at: new Date() }],
  });

  thread.lastMessage = message._id;
  thread.lastMessageAt = new Date();
  await thread.save();

  const populatedMessage = await Message.findById(message._id)
    .populate("sender", "username")
    .populate({
      path: "offer",
      populate: [
        { path: "buyer", select: "username" },
        { path: "seller", select: "username" },
        { path: "listing", select: "title" },
      ],
    })
    .populate("actor", "username");

  res.status(201).json(populatedMessage);
});

export const getThreadMessages = asyncHandler(async (req, res) => {
  const user = req.user;
  const { threadId } = req.params;
  const { limit = 10, before } = req.query;

  const threadObjectId = new mongoose.Types.ObjectId(threadId);
  const thread = await Thread.findById(threadObjectId);
  if (!thread) throw createError("Thread not found", 404);

  if (
    String(thread.buyer) !== String(user._id) &&
    String(thread.seller) !== String(user._id)
  ) {
    throw createError("Forbidden", 403);
  }

  const listing = await Listing.findById(thread.listing).select(
    "designer title price thumbnail isSold isDeleted isDraft canOffer seller buyer"
  );

  const query = { thread: threadObjectId };
  if (before) query.createdAt = { $lt: new Date(before) };

  const hardLimit = Math.max(1, Number(limit) || 10);
  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(hardLimit + 1)
    .populate("sender", "username")
    .populate({
      path: "offer",
      populate: [
        { path: "buyer", select: "username" },
        { path: "seller", select: "username" },
        { path: "listing", select: "title" },
      ],
    })
    .populate("actor", "username");

  const hasMore = messages.length > hardLimit;
  const trimmed = hasMore ? messages.slice(0, hardLimit) : messages;
  const nextCursor = trimmed.length
    ? trimmed[trimmed.length - 1].createdAt
    : null;

  const pendingOffer = await Message.exists({
    thread: threadObjectId,
    type: "offer",
    "offerSnapshot.status": "pending",
  });

  res.json({
    messages: trimmed.reverse(),
    hasMore,
    nextCursor,
    pendingOffer: Boolean(pendingOffer),
    listing,
  });
});

export const markAsRead = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user?._id) throw createError("Unauthorized", 401);

  const { threadId } = req.params;

  const thread = await Thread.findById(threadId);
  if (!thread) throw createError("Thread not found", 404);

  if (
    String(thread.buyer) !== String(user._id) &&
    String(thread.seller) !== String(user._id)
  ) {
    throw createError("Forbidden", 403);
  }

  await Message.updateMany(
    { thread: thread._id, "readBy.user": { $ne: user._id } },
    { $push: { readBy: { user: user._id, at: new Date() } } }
  );

  res.json({ message: "Messages marked as read" });
});

export const getInbox = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user?._id) throw createError("Unauthorized", 401);

  const userId = new mongoose.Types.ObjectId(user._id);

  const lastMessagePopulate = {
    path: "lastMessage",
    select: "type content createdAt system offerSnapshot sender actor offer",
    populate: [
      { path: "sender", select: "username" },
      { path: "actor", select: "username" },
      {
        path: "offer",
        populate: [
          { path: "buyer", select: "username" },
          { path: "seller", select: "username" },
          { path: "listing", select: "title" },
        ],
      },
    ],
  };

  const [buyThreads, sellThreads, unreadMessages] = await Promise.all([
    Thread.find({ buyer: userId })
      .populate({
        path: "listing",
        select:
          "designer title price thumbnail isSold isDeleted isDraft isArchived canOffer seller buyer",
      })
      .populate("buyer", "username")
      .populate("seller", "username")
      .populate(lastMessagePopulate)
      .sort("-lastMessageAt"),

    Thread.find({ seller: userId })
      .populate({
        path: "listing",
        select:
          "designer title price thumbnail isSold isDeleted isDraft isArchived canOffer seller buyer",
      })
      .populate("buyer", "username")
      .populate("seller", "username")
      .populate(lastMessagePopulate)
      .sort("-lastMessageAt"),

    Message.find({
      "readBy.user": { $ne: userId },
      sender: { $ne: userId },
    }).select("thread"),
  ]);

  const unreadThreadIds = new Set(
    unreadMessages.map((m) => m.thread.toString())
  );

  const allThreads = [...buyThreads, ...sellThreads];
  const allThreadIds = allThreads.map((t) => t._id);

  const pendingOfferAgg = await Message.aggregate([
    {
      $match: {
        thread: { $in: allThreadIds },
        type: "offer",
        "offerSnapshot.status": "pending",
      },
    },
    { $group: { _id: "$thread" } },
  ]);

  const pendingOfferThreadIds = new Set(
    pendingOfferAgg.map((d) => d._id.toString())
  );

  const listingIds = [
    ...buyThreads.map((t) => t.listing?._id),
    ...sellThreads.map((t) => t.listing?._id),
  ].filter(Boolean);

  const listings = await Listing.find({ _id: { $in: listingIds } }).select(
    "_id isSold isDeleted buyer"
  );

  const listingMap = new Map(listings.map((l) => [l._id.toString(), l]));

  const enrich = (threads) =>
    threads.map((t) => {
      const listing = listingMap.get(
        (t.listing?._id || t.listing)?.toString?.() || ""
      );

      let archivedReason = null;
      if (listing?.isDeleted) archivedReason = "listing_deleted";
      else if (listing?.isSold && String(listing.buyer) === String(user._id))
        archivedReason = "sold_to_you";
      else if (listing?.isSold) archivedReason = "sold_to_other";

      return {
        ...t.toObject(),
        archivedReason,
        hasUnread: unreadThreadIds.has(t._id.toString()),
        pendingOffer: pendingOfferThreadIds.has(t._id.toString()),
      };
    });

  res.json({
    buyThreads: enrich(buyThreads),
    sellThreads: enrich(sellThreads),
  });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user?._id) throw createError("Unauthorized", 401);

  const threads = await Thread.find({
    $or: [{ buyer: user._id }, { seller: user._id }],
  }).select("_id");

  if (!threads.length) {
    return res.json({ unreadCount: 0 });
  }

  const threadIds = threads.map((t) => t._id);

  const unreadCount = await Message.countDocuments({
    thread: { $in: threadIds },
    sender: { $ne: user._id },
    "readBy.user": { $ne: user._id },
  });

  res.json({ unreadCount });
});
