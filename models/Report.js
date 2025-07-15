import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      enum: [
        "Trademark Copyright Or DMCA Violation",
        "Inauthentic Item",
        "Suspicious Seller Or Potential Scam",
        "Other",
      ],
      required: true,
    },
    notes: {
      type: String,
      maxlength: 2000,
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const Report = mongoose.model("Report", ReportSchema);
export default Report;
