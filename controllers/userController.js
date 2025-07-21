import User from "../models/User.js";
import Listing from "../models/Listing.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";
import crypto from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const getUserFavorites = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate("favorites");
  if (!user) throw createError("User not found", 404);
  res.status(200).json(user.favorites);
});

export const addFavorite = asyncHandler(async (req, res) => {
  const user = req.user;
  const { listingId } = req.params;

  const listing = await Listing.findById(listingId);

  if (!listing) {
    return res.status(404).json({ message: "Listing not found" });
  }

  if (listing.seller.toString() === user._id.toString()) {
    return res
      .status(400)
      .json({ message: "Cannot favorite your own listing" });
  }

  if (!user.favorites.includes(listingId)) {
    user.favorites.push(listingId);
    listing.favoritesCount += 1;
    await Promise.all([user.save(), listing.save()]);
  }

  const updatedUser = await user.populate("favorites");

  res.status(200).json({
    message: "Added to favorites",
    favorites: updatedUser.favorites,
  });
});

export const removeFavorite = asyncHandler(async (req, res) => {
  const user = req.user;
  const { listingId } = req.params;

  const listing = await Listing.findById(listingId);

  if (!listing) {
    return res.status(404).json({ message: "Listing not found" });
  }

  const wasFavorited = user.favorites.includes(listingId);

  if (wasFavorited) {
    user.favorites = user.favorites.filter(
      (fav) => fav.toString() !== listingId
    );
    listing.favoritesCount = Math.max(0, listing.favoritesCount - 1);
    await Promise.all([user.save(), listing.save()]);
  }

  const updatedUser = await user.populate("favorites");

  res.status(200).json({
    message: "Removed from favorites",
    favorites: updatedUser.favorites,
  });
});

export const getUserSizes = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("settings.sizes");
  if (!user) throw createError("User not found", 404);
  res.status(200).json(user.settings.sizes || {});
});

export const updateUserSizes = asyncHandler(async (req, res) => {
  const user = req.user;
  const { menswear, womenswear } = req.body;

  user.settings.sizes = {
    menswear: menswear || {},
    womenswear: womenswear || {},
  };

  await user.save();

  res.status(200).json({
    message: "Sizes updated successfully",
    sizes: user.settings.sizes,
  });
});

export const getForSale = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw createError("User not found", 404);

  const listings = await Listing.find({
    seller: user._id,
    isDraft: false,
    isSold: false,
  });
  if (!listings.length)
    throw createError("No active listings from this seller", 404);

  res.status(200).json(listings);
});

export const updatePrivacySettings = asyncHandler(async (req, res) => {
  const user = req.user;
  const { location, privacy } = req.body;

  if (location) user.settings.location = location;

  if (privacy) {
    const { favoritesPublic, closetPublic, followersPublic, followingPublic } =
      privacy;

    if (typeof favoritesPublic === "boolean")
      user.settings.favoritesPublic = favoritesPublic;
    if (typeof closetPublic === "boolean")
      user.settings.closetPublic = closetPublic;
    if (typeof followersPublic === "boolean")
      user.settings.followersPublic = followersPublic;
    if (typeof followingPublic === "boolean")
      user.settings.followingPublic = followingPublic;
  }

  await user.save();

  res.status(200).json({ message: "Profile updated", user });
});

export const updateUsername = asyncHandler(async (req, res) => {
  const user = req.user;
  const { username } = req.body;

  if (!username || username.length < 3 || username.length > 30) {
    throw createError("Invalid username length", 400);
  }

  if (username === user.username) {
    return res.status(200).json({ message: "No change", user });
  }

  const exists = await User.findOne({ username });
  if (exists && exists._id.toString() !== user._id.toString()) {
    throw createError("Username already taken", 409);
  }

  const now = new Date();
  const lastChanged = user.settings?.lastUsernameChange;

  if (lastChanged && now - new Date(lastChanged) < 30 * 24 * 60 * 60 * 1000) {
    const nextAllowed = new Date(
      new Date(lastChanged).getTime() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    throw createError(
      `You can only change your username once every 30 days. Try again after ${new Date(
        nextAllowed
      ).toLocaleDateString()}.`,
      429
    );
  }

  user.username = username;
  user.settings.lastUsernameChange = now;
  await user.save();

  res.status(200).json({ message: "Username updated", user });
});

export const isUsernameAvailable = asyncHandler(async (req, res) => {
  const user = req.user;
  const { username } = req.query;

  if (!user) {
    throw createError("Unauthorized", 401);
  }

  if (!username || username.trim().length === 0) {
    throw createError("Username is required", 400);
  }

  const existingUser = await User.findOne({ username: username.trim() });

  if (existingUser) {
    return res
      .status(200)
      .json({ message: "Username is taken", available: false });
  }

  res.status(200).json({ message: "Username is available", available: true });
});

export const isEmailAvailable = asyncHandler(async (req, res) => {
  const user = req.user;
  const { email } = req.query;

  if (!user) {
    throw createError("Unauthorized", 401);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw createError("A valid email is required", 400);
  }

  const existingUser = await User.findOne({ email: email.trim() });

  if (existingUser && existingUser._id.toString() !== user._id.toString()) {
    return res.status(200).json({
      message: "This email is already associated with another account",
      available: false,
    });
  }

  res.status(200).json({ available: true });
});

export const getUserSettings = asyncHandler(async (req, res) => {
  const user = req.user;

  res.status(200).json({
    location: user.settings?.location ?? null,
    settings: {
      favoritesPublic: user.settings?.favoritesPublic ?? true,
      closetPublic: user.settings?.closetPublic ?? false,
      followersPublic: user.settings?.followersPublic ?? true,
      followingPublic: user.settings?.followingPublic ?? true,
    },
  });
});

export const requestEmailChange = asyncHandler(async (req, res) => {
  const user = req.user;
  const { newEmail } = req.body;

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    throw createError("A valid email is required", 400);
  }

  const existing = await User.findOne({ email: newEmail.toLowerCase() });
  if (existing && existing._id.toString() !== user._id.toString()) {
    throw createError("Email is already in use", 409);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  user.pendingEmail = newEmail.toLowerCase();
  user.pendingEmailToken = hashedToken;
  user.pendingEmailExpires = expires;
  await user.save();

  const confirmUrl = `${process.env.CLIENT_URL}/confirm-email-change?token=${rawToken}`;

  await resend.emails.send({
    from: "I Need It <noreply@resend.dev>",
    to: [newEmail],
    subject: "Confirm your email change",
    html: `
      <div style="max-width: 600px; margin: auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 8px; font-family: Arial, sans-serif; background-color: #ffffff;">
        <h2 style="color: #333333;">Confirm your email change</h2>
        <p style="font-size: 16px; color: #555555;">
          You requested to change your email. Click the button below to confirm this change. This link will expire in 1 hour.
        </p>
        <a href="${confirmUrl}" style="display: inline-block; padding: 12px 20px; margin-top: 20px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold;">Confirm Email</a>
        <p style="font-size: 14px; color: #999999; margin-top: 30px;">If you didn’t request this, you can safely ignore this email.</p>
        <p style="font-size: 12px; color: #cccccc;">— The I NEED IT Team</p>
      </div>
    `,
  });

  res.status(200).json({ message: "Verification email sent" });
});

export const confirmEmailChange = asyncHandler(async (req, res) => {
  const { token } = req.query;
  console.log(req.query.token);

  if (!token) {
    throw createError("Invalid or missing token", 400);
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    pendingEmailToken: hashedToken,
    pendingEmailExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw createError("This link has already been used or has expired", 400);
  }

  user.email = user.pendingEmail;
  user.pendingEmail = undefined;
  user.pendingEmailToken = undefined;
  user.pendingEmailExpires = undefined;

  await user.save();

  res.status(200).json({ message: "Email updated successfully", user });
});
