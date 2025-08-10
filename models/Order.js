import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
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

    // Wallet flow: order is created after payment succeeds
    status: {
      type: String,
      enum: ["PAID", "SHIPPED", "DELIVERED", "CANCELED"],
      default: "PAID",
    },

    trackingNumber: { type: String, default: null },
    carrier: { type: String, default: null },
    shippedAt: Date,
    deliveredAt: Date,

    // Snapshot of where it's going
    shippingAddress: {
      fullName: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      zip: String,
      country: String,
    },

    // Keep as-is for now (you can upgrade to a full address later)
    shippingFrom: {
      type: String,
      default: null,
    },

    // Existing float-based breakdown (you can keep using it for UI),
    // but total_cents + currency below are the source of truth.
    price: {
      listingPrice: { type: Number, required: true },
      shipping: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },

    // 🔹 Money you actually trust (wallet + math): store in cents
    total_cents: { type: Number, required: true },
    currency: { type: String, default: "USD" },

    paymentMethod: {
      type: String,
      default: "Wallet",
    },

    // Snapshot of the listing at purchase time
    listingSnapshot: {
      title: String,
      designer: String, // was "brand"
      size: String,
      price_cents: Number, // was "price"
      imageUrl: String,
      // optionally add: condition, images[], etc. later if you want
    },

    orderId: { type: String, unique: true },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", OrderSchema);
export default Order;
