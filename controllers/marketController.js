import Listing from "../models/Listing.js";
import cloudinary from "../config/cloudinary.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";

export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file)
    throw createError(400, "No file uploaded or file type not allowed");

  const fileStr = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

  const uploaded = await cloudinary.uploader.upload(fileStr, {
    folder: "i-need-it-listings",
    resource_type: "image",
  });

  res.status(200).json({ url: uploaded.secure_url });
});

export const uploadListing = asyncHandler(async (req, res) => {
  const { formData } = req.body;
  if (!formData) throw createError("Listing data is required", 400);

  const cleanPrice = parseFloat(formData.priceInput?.replace(/[^0-9.]/g, ""));

  const baseListing = {
    department: formData.selectedDepartment || undefined,
    category: formData.selectedCategory || undefined,
    subCategory: formData.selectedSubcategory || undefined,
    size: formData.selectedSize || undefined,
    designer: formData.selectedDesigner || undefined,
    title: formData.itemName || undefined,
    description: formData.description ?? "",
    color: formData.selectedColor?.name || undefined,
    condition: formData.selectedCondition || undefined,
    tags: formData.tags ?? [],
    price: cleanPrice || undefined,
    thumbnail: formData.uploadedImageUrls?.[0],
    images: formData.uploadedImageUrls || [],
    seller: req.user._id,
    canOffer: formData.acceptOffers ?? undefined,
    isDraft: formData.isDraft === true,
    countryOfOrigin: formData.countryOfOrigin || undefined,
  };

  const requiredFields = [
    "selectedDepartment",
    "selectedCategory",
    "selectedSubcategory",
    "selectedSize",
    "selectedDesigner",
    "itemName",
    "selectedColor",
    "selectedCondition",
    "priceInput",
    "uploadedImageUrls",
  ];

  if (!formData.isDraft && requiredFields.some((field) => !formData[field])) {
    throw createError("All fields are required", 400);
  }

  const listing = await Listing.create(baseListing);
  res.status(201).json({ message: "Listing created", listing });
});

export const patchListing = asyncHandler(async (req, res) => {
  const { formData, listingId } = req.body;

  if (!listingId) {
    throw createError(400, "Listing ID is required to update listing");
  }

  const cleanPrice = parseFloat(formData.priceInput?.replace(/[^0-9.]/g, ""));

  const updatedFields = {
    department: formData.selectedDepartment || undefined,
    category: formData.selectedCategory || undefined,
    subCategory: formData.selectedSubcategory || undefined,
    size: formData.selectedSize || undefined,
    designer: formData.selectedDesigner || undefined,
    title: formData.itemName || undefined,
    description: formData.description ?? "",
    color: formData.selectedColor?.name || undefined,
    condition: formData.selectedCondition || undefined,
    tags: formData.tags ?? [],
    price: cleanPrice || undefined,
    thumbnail: formData.uploadedImageUrls?.[0],
    images: formData.uploadedImageUrls || [],
    canOffer: formData.acceptOffers ?? undefined,
    isDraft: formData.isDraft === true,
    countryOfOrigin: formData.countryOfOrigin || undefined,
  };

  const updated = await Listing.findByIdAndUpdate(listingId, updatedFields, {
    new: true,
  });

  if (!updated) {
    throw createError(404, "Listing not found or could not be updated");
  }

  res.status(200).json({ message: "Listing updated", listing: updated });
});

export const deleteDraft = asyncHandler(async (req, res) => {
  const { draftId } = req.body;
  if (!draftId) throw createError("Draft ID is required", 400);

  const draft = await Listing.findOne({ _id: draftId, isDraft: true });
  if (!draft) throw createError("Draft not found or is not a draft", 404);
  if (draft.seller.toString() !== req.user._id.toString()) {
    throw createError("Not authorized to delete this draft", 403);
  }

  await draft.deleteOne();
  res.status(200).json({ message: "Draft deleted successfully" });
});
