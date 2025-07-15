import mongoose from "mongoose";
import categoryMap from "../data/categoryMap.js";
import countries from "../data/countries.js";
import designers from "../data/designers.js";

const ListingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required() {
        return !this.isDraft;
      },
      trim: true,
    },
    designer: {
      type: String,
      enum: designers,
      required() {
        return !this.isDraft;
      },
      trim: true,
    },
    description: {
      type: String,
      maxlength: 1000,
    },
    originalPrice: {
      type: Number,
      min: 1,
      max: 200000,
    },
    price: {
      type: Number,
      required() {
        return !this.isDraft;
      },
      min: 1,
      max: 200000,
    },
    countryOfOrigin: {
      type: String,
      enum: countries,
      required() {
        return !this.isDraft;
      },
    },
    thumbnail: String,
    isFreeShipping: { type: Boolean, default: false },
    shippingCost: { type: Number, default: 0 },
    department: {
      type: String,
      enum: ["Menswear", "Womenswear"],
      required() {
        return !this.isDraft;
      },
    },
    category: {
      type: String,
      enum: [
        "Tops",
        "Bottoms",
        "Outerwear",
        "Footwear",
        "Accessories",
        "Dresses",
        "Bags & Luggage",
        "Jewelry",
        "Tailoring",
      ],
      required() {
        return !this.isDraft;
      },
    },
    subCategory: {
      type: String,
      validate: {
        validator(value) {
          if (this.isDraft) return true;
          const department = this.department;
          const category = this.category;
          const validOptions = categoryMap[department]?.[category] || [];
          return validOptions.includes(value);
        },
        message: (props) =>
          `"${props.value}" is not a valid subcategory for the selected category.`,
      },
    },
    size: {
      type: String,
      enum: [
        "XXS",
        "XS",
        "S",
        "M",
        "L",
        "XL",
        "XXL",
        "One Size",
        "38",
        "39",
        "40",
        "41",
        "42",
        "43",
        "44",
        "45",
      ],
      required() {
        return !this.isDraft;
      },
    },
    color: {
      type: String,
      enum: [
        "Beige",
        "Black",
        "Blue",
        "Brown",
        "Gold",
        "Gray",
        "Green",
        "Navy",
        "Olive",
        "Orange",
        "Other",
        "Pink",
        "Purple",
        "Red",
        "Silver",
        "White",
        "Yellow",
      ],
      required() {
        return !this.isDraft;
      },
    },
    condition: {
      type: String,
      enum: ["New/Never Worn", "Gently Used", "Used", "Very Worn"],
      required() {
        return !this.isDraft;
      },
    },
    tags: [String],
    images: [String],
    favoritesCount: { type: Number, default: 0 },
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    canOffer: { type: Boolean, default: true },
    offers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Offer" }],
    isSold: { type: Boolean, default: false },
    isDraft: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    authenticated: { type: Boolean, default: true },
    listingCode: String,
    reports: [{ type: mongoose.Schema.Types.ObjectId, ref: "Report" }],
  },
  { timestamps: true }
);

const Listing = mongoose.model("Listing", ListingSchema);
export default Listing;
