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
      enum: ["PAID", "SHIPPED", "IN TRANSIT", "DELIVERED", "CANCELED"],
      default: "PAID",
    },

    statusHistory: [
      {
        status: {
          type: String,
          enum: ["PAID", "SHIPPED", "IN TRANSIT", "DELIVERED", "CANCELED"],
          required: true,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    trackingNumber: { type: String, default: null },

    shippingAddress: {
      fullName: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      zip: String,
      country: String,
      phone: String,
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

    total_cents: { type: Number, required: true },
    currency: { type: String, default: "USD" },

    paymentMethod: {
      type: String,
      default: "Credit",
    },

    listingSnapshot: {
      title: String,
      designer: String,
      size: String,
      price_cents: Number,
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

OrderSchema.index({ listing: 1, buyer: 1 }, { unique: true });

const Order = mongoose.model("Order", OrderSchema);
export default Order;
