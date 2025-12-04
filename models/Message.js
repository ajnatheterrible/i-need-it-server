import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    thread: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Thread",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.type !== "system";
      },
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        if (this.type !== "system") return false;

        const eventsRequiringActor = ["offer_accepted", "offer_declined"];

        return eventsRequiringActor.includes(this.system?.event);
      },
    },
    type: {
      type: String,
      enum: ["text", "offer", "system"],
      default: "text",
      required: true,
    },
    content: {
      type: String,
      maxlength: 2000,
      required: function () {
        return this.type === "text";
      },
    },
    offer: { type: mongoose.Schema.Types.ObjectId, ref: "Offer" },
    offerSnapshot: {
      amount_cents: Number,
      status: {
        type: String,
        enum: ["pending", "accepted", "declined", "expired"],
      },
      createdAt: { type: Date, default: Date.now },
    },
    system: {
      event: {
        type: String,
        enum: [
          "offer_declined",
          "offer_expired",
          "order_created",
          "order_shipped",
          "order_in_transit",
          "order_delivered",
          "payout_released",
          "refund_issued",
        ],
      },
      data: mongoose.Schema.Types.Mixed,
    },
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

MessageSchema.index({ thread: 1, createdAt: -1 });
MessageSchema.index({ thread: 1, "readBy.user": 1, createdAt: 1 });

export default mongoose.model("Message", MessageSchema);
