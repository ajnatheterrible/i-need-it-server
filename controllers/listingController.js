import Listing from "../models/Listing.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";
import client from "../meili/meili.js";

export const getFeedListings = asyncHandler(async (req, res) => {
  const { query, department, category, condition, size, priceMin, priceMax } =
    req.query;

  const meiliFilters = [];

  const addFilter = (key, value) => {
    const values = value
      .split(",")
      .map((v) => `"${v.trim()}"`)
      .join(", ");
    meiliFilters.push(`${key} IN [${values}]`);
  };

  if (department) addFilter("department", department);
  if (category) addFilter("category", category);
  if (size) addFilter("size", size);
  if (condition) addFilter("condition", condition);

  if (priceMin || priceMax) {
    if (priceMin && priceMax) {
      meiliFilters.push(`price >= ${priceMin} AND price <= ${priceMax}`);
    } else if (priceMin) {
      meiliFilters.push(`price >= ${priceMin}`);
    } else if (priceMax) {
      meiliFilters.push(`price <= ${priceMax}`);
    }
  }

  const searchOptions = {
    filter: meiliFilters.length ? meiliFilters.join(" AND ") : undefined,
    limit: 100,
  };

  const results = await client
    .index("listings")
    .search(query || "", searchOptions);

  res.json(results.hits);
});

export const getListingById = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id).populate(
    "seller",
    "username"
  );

  if (!listing) throw createError("Listing not found", 404);

  res.json(listing);
});

export const getDrafts = asyncHandler(async (req, res) => {
  const drafts = await Listing.find({
    seller: req.user._id,
    isDraft: true,
  }).sort({ createdAt: -1 });
  if (!drafts) throw createError("No drafts found", 404);
  res.json(drafts);
});

export const getRandomListings = asyncHandler(async (req, res) => {
  const listings = await Listing.aggregate([
    { $match: { isSold: false, isDraft: false, isDeleted: false } },
    { $sample: { size: 20 } },
  ]);
  res.json(listings);
});
