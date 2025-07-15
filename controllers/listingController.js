import Listing from "../models/Listing.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";

export const getFeedListings = asyncHandler(async (req, res) => {
  const { query, department, category, condition, size, priceMin, priceMax } =
    req.query;

  const filter = { $and: [] };

  if (query) {
    const terms = query.split(" ").map((word) => new RegExp(word, "i"));
    filter.$and.push(
      ...terms.map((term) => ({
        $or: [
          { title: term },
          { designer: term },
          { description: term },
          { tags: term },
          { category: term },
          { department: term },
        ],
      }))
    );
  }

  if (department)
    filter.$and.push({ department: { $in: department.split(",") } });
  if (category) filter.$and.push({ category: { $in: category.split(",") } });
  if (size) filter.$and.push({ size: { $in: size.split(",") } });
  if (condition) filter.$and.push({ condition: { $in: condition.split(",") } });

  if (priceMin || priceMax) {
    const priceFilter = {};
    if (priceMin) priceFilter.$gte = parseFloat(priceMin);
    if (priceMax) priceFilter.$lte = parseFloat(priceMax);
    filter.$and.push({ price: priceFilter });
  }

  if (filter.$and.length === 0) delete filter.$and;

  const listings = await Listing.find(filter);
  res.json(listings);
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
