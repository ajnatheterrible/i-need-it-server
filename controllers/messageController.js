import Message from "../models/Message.js";
import Thread from "../models/Thread.js";
import Listing from "../models/Listing.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";

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

  thread.lastMessageAt = new Date();
  await thread.save();

  res.status(201).json({ message: "Message sent", data: message });
});

export const getThreadMessages = asyncHandler(async (req, res) => {
  const user = req.user;
  const { threadId } = req.params;

  const thread = await Thread.findById(threadId);
  if (!thread) throw createError("Thread not found", 404);

  if (
    String(thread.buyer) !== String(user._id) &&
    String(thread.seller) !== String(user._id)
  ) {
    throw createError("Forbidden", 403);
  }

  const messages = await Message.find({ thread: thread._id }).sort("createdAt");
  res.json(messages);
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

  const [buyThreads, sellThreads] = await Promise.all([
    Thread.find({ buyer: user._id }).sort("-lastMessageAt"),
    Thread.find({ seller: user._id }).sort("-lastMessageAt"),
  ]);

  res.json({ buyThreads, sellThreads });
});
