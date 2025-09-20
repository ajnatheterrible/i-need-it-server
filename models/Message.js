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

    offer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
    },

    offerSnapshot: {
      amount: Number,
      status: {
        type: String,
        enum: ["pending", "accepted", "declined"],
      },
      createdAt: Date,
    },

    system: {
      event: {
        type: String,
        enum: ["offer_accepted", "offer_declined", "order_shipped"],
      },
      data: mongoose.Schema.Types.Mixed,
    },

    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.index({ thread: 1, createdAt: -1 });
MessageSchema.index({ thread: 1, read: 1 });

const Message = mongoose.model("Message", MessageSchema);
export default Message;
