import User from "../models/User.js";
import Listing from "../models/Listing.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";

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
