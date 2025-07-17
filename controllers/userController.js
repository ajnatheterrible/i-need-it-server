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

export const updateUserProfileSettings = asyncHandler(async (req, res) => {
  const user = req.user;
  const { username, location, privacy } = req.body;

  if (username) user.username = username;
  if (location) user.location = location;

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

export const addUserAddress = asyncHandler(async (req, res) => {
  const user = req.user;
  const newAddress = req.body;

  if (!user.addresses) user.addresses = [];
  user.addresses.push(newAddress);
  await user.save();

  res.status(201).json({ message: "Address added", addresses: user.addresses });
});

export const updateUserAddress = asyncHandler(async (req, res) => {
  const user = req.user;
  const { addressId } = req.params;
  const updatedData = req.body;

  const address = user.addresses.id(addressId);
  if (!address) throw createError("Address not found", 404);

  Object.assign(address, updatedData);
  await user.save();

  res.status(200).json({ message: "Address updated", address });
});

export const deleteUserAddress = asyncHandler(async (req, res) => {
  const user = req.user;
  const { addressId } = req.params;

  user.addresses = user.addresses.filter(
    (addr) => addr._id.toString() !== addressId
  );
  await user.save();

  res
    .status(200)
    .json({ message: "Address deleted", addresses: user.addresses });
});

export const setDefaultReturnAddress = asyncHandler(async (req, res) => {
  const user = req.user;
  const { addressId } = req.body;

  const exists = user.addresses.some(
    (addr) => addr._id.toString() === addressId
  );
  if (!exists) throw createError("Address not found", 404);

  user.settings.defaultReturnAddressId = addressId;
  await user.save();

  res.status(200).json({ message: "Default return address set" });
});

export const addPaymentMethod = asyncHandler(async (req, res) => {
  const user = req.user;
  const newCard = req.body;

  if (!user.paymentMethods) user.paymentMethods = [];
  user.paymentMethods.push(newCard);
  await user.save();

  res.status(201).json({ message: "Card added", cards: user.paymentMethods });
});

export const removePaymentMethod = asyncHandler(async (req, res) => {
  const user = req.user;
  const { cardId } = req.params;

  user.paymentMethods = user.paymentMethods.filter(
    (card) => card._id.toString() !== cardId
  );

  await user.save();

  res.status(200).json({ message: "Card removed", cards: user.paymentMethods });
});
