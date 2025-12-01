import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    tags: {
      type: [String],
      enum: ["FAST_SHIPPER", "ITEM_AS_DESCRIBED", "QUICK_REPLIES"],
      default: [],
      validate: {
        validator(value) {
          if (!Array.isArray(value)) return false;
          const unique = new Set(value);
          return unique.size === value.length && value.length <= 3;
        },
        message: "Invalid review tags.",
      },
    },
    comment: {
      type: String,
      maxlength: 2000,
      validate: {
        validator(value) {
          if (this.rating <= 2) {
            return typeof value === "string" && value.trim().length > 0;
          }
          return true;
        },
        message: "Comment is required for 1–2 star reviews.",
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Review = mongoose.model("Review", ReviewSchema);
export default Review;
