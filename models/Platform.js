import mongoose from "mongoose";

const PlatformSchema = new mongoose.Schema(
  {
    totalRevenueCents: {
      type: Number,
      default: 0,
    },
    totalTransactions: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "Main marketplace wallet",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Platform", PlatformSchema);
