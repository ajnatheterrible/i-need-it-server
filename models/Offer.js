import mongoose from "mongoose";

const AddressSchema = new mongoose.Schema(
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
);

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

    mode: {
      type: String,
      enum: ["buyer", "seller_private", "seller_broadcast"],
      required: true,
    },

    amount_cents: {
      type: Number,
      required: true,
    },

    shipping_cents: {
      type: Number,
      default: 0,
    },

    tax_cents: {
      type: Number,
      default: 0,
    },

    total_cents: {
      type: Number,
      required: true,
    },

    shippingAddress: {
      type: AddressSchema,
      required: function () {
        return this.mode === "buyer";
      },
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired"],
      default: "pending",
    },

    expiresAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },

    fundsHeld: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Offer", OfferSchema);
