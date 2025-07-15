import mongoose from "mongoose";
import bcrypt from "bcrypt";

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 30,
      required() {
        return this.authProvider === "local";
      },
      unique: true,
    },
    usernameLower: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 30,
      unique: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
      required() {
        return this.authProvider === "local";
      },
    },
    googleId: {
      type: String,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      required: true,
      default: "local",
      index: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      maxlength: 500,
      default: "",
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "demo"],
      default: "user",
      index: true,
    },
    settings: {
      address: { type: String, default: "" },
      paymentMethod: { type: String, default: "" },
      favoritesPublic: { type: Boolean, default: true },
      closetPublic: { type: Boolean, default: false },
      followersPublic: { type: Boolean, default: true },
      followingPublic: { type: Boolean, default: true },
      sizes: {
        menswear: {
          Tops: [String],
          Bottoms: [String],
          Outerwear: [String],
          Footwear: [String],
          Tailoring: [String],
          Accessories: [String],
        },
        womenswear: {
          Tops: [String],
          Bottoms: [String],
          Outerwear: [String],
          Footwear: [String],
          Dresses: [String],
          Accessories: [String],
          Bags: [String],
          Jewelry: [String],
        },
      },
    },
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Listing",
      },
    ],
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    permissions: {
      type: String,
      enum: ["read-only", "full"],
      default: "full",
    },
    signupIncompleteAt: {
      type: Date,
      default() {
        return this.authProvider === "google" && !this.username
          ? new Date()
          : undefined;
      },
      index: true,
    },
    resetPasswordToken: {
      type: String,
      index: true,
    },
    resetPasswordExpires: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (this.isModified("username") && this.username) {
    this.usernameLower = this.username.toLowerCase();
  }

  if (!this.isModified("password") || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", UserSchema);
export default User;
