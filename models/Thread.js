import mongoose from "mongoose";

const ThreadSchema = new mongoose.Schema(
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
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessageAt: { type: Date, default: Date.now },

    isArchived: { type: Boolean, default: false },
    archivedReason: {
      type: String,
      enum: ["sold_to_other", "listing_deleted"],
      default: null,
    },
  },
  { timestamps: true }
);

ThreadSchema.index({ listing: 1, buyer: 1, seller: 1 }, { unique: true });
ThreadSchema.index({ lastMessageAt: -1 });

export default mongoose.model("Thread", ThreadSchema);
