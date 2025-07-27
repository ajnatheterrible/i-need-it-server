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

    status: {
      type: String,
      enum: [
        "awaiting_shipment",
        "shipped",
        "in_transit",
        "delivered",
        "completed",
      ],
      default: "awaiting_shipment",
    },

    trackingNumber: { type: String, default: null },
    carrier: { type: String, default: null },
    shippedAt: Date,
    deliveredAt: Date,

    shippingAddress: {
      fullName: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      zip: String,
      country: String,
    },

    shippingFrom: {
      type: String,
      default: null,
    },

    price: {
      listingPrice: { type: Number, required: true },
      shipping: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },

    paymentMethod: {
      type: String,
      default: "Unknown",
    },

    listingSnapshot: {
      title: String,
      brand: String,
      size: String,
      price: Number,
      imageUrl: String,
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
