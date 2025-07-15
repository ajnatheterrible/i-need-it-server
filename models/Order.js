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
    confirmedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", OrderSchema);
export default Order;
