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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
      required: true,
    },
    message: {
      type: String,
      maxlength: 1000,
    },
    respondedAt: Date,
  },
  { timestamps: true }
);

const Offer = mongoose.model("Offer", OfferSchema);
export default Offer;
