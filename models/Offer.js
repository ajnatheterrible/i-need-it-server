import mongoose from "mongoose";

const OfferSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amount_cents: { type: Number, required: true },
    shipping_cents: { type: Number, default: 0 },
    tax_cents: { type: Number, default: 0 },
    total_cents: { type: Number, required: true },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired"],
      default: "pending",
    },

    message: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },

    fundsHeld: { type: Boolean, default: false },

    parentOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Offer", OfferSchema);
