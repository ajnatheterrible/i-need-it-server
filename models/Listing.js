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
    shippingFrom: {
      type: new mongoose.Schema(
        {
          fullName: { type: String, required: true },
          line1: { type: String, required: true },
          line2: { type: String },
          city: { type: String, required: true },
          state: { type: String, required: true },
          zip: { type: String, required: true },
          country: { type: String, required: true },
          phone: { type: String },
        },
        { _id: false }
      ),
      required() {
        return !this.isDraft;
      },
    },
    shippingRegions: {
      type: [
        {
          region: {
            type: String,
            enum: [
              "United States",
              "Canada",
              "United Kingdom",
              "Europe",
              "Asia",
              "Australia / NZ",
              "Other",
            ],
          },
          cost: {
            type: Number,
            min: 0,
          },
          enabled: {
            type: Boolean,
            default: false,
          },
        },
      ],
      validate: {
        validator(value) {
          if (this.isDraft) return true;
          if (!Array.isArray(value)) return false;

          return value.some((region) => region.enabled === true);
        },
        message: "At least one shipping region must be enabled.",
      },
      required() {
        return !this.isDraft;
      },
    },
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
        "XS",
        "S",
        "M",
        "L",
        "XL",
        "One Size",
        "37",
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
    authenticated: { type: Boolean, default: true },
    listingCode: String,
    reports: [{ type: mongoose.Schema.Types.ObjectId, ref: "Report" }],
  },
  { timestamps: true }
);

ListingSchema.pre("validate", function (next) {
  const DEFAULT_US_RATE = 20;

  if (!Array.isArray(this.shippingRegions)) {
    this.shippingRegions = [];
  }

  const usIndex = this.shippingRegions.findIndex(
    (r) => r.region === "United States"
  );

  const usRegion = {
    region: "United States",
    enabled: true,
    cost: this.isFreeShipping ? 0 : DEFAULT_US_RATE,
  };

  if (usIndex === -1) {
    this.shippingRegions.push(usRegion);
  } else {
    this.shippingRegions[usIndex] = {
      ...this.shippingRegions[usIndex],
      ...usRegion,
    };
  }

  next();
});

const Listing = mongoose.model("Listing", ListingSchema);
export default Listing;
