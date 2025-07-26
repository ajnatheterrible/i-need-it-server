import mongoose from "mongoose";
import bcrypt from "bcrypt";

const clothingSizes = ["XS", "S", "M", "L", "XL"];
const footwearSizes = ["37", "38", "39", "40", "41", "42", "43", "44", "45"];

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
      addresses: [
        {
          fullName: { type: String, default: "" },
          line1: { type: String, default: "" },
          line2: { type: String, default: "" },
          city: { type: String, default: "" },
          state: { type: String, default: "" },
          zip: { type: String, default: "" },
          country: { type: String, default: "" },
          phone: { type: String, default: "" },
          isDefaultShipping: { type: Boolean, default: false },
          isDefaultPurchase: { type: Boolean, default: false },
        },
      ],
      favoritesPublic: { type: Boolean, default: true },
      closetPublic: { type: Boolean, default: false },
      followersPublic: { type: Boolean, default: true },
      followingPublic: { type: Boolean, default: true },
      location: {
        type: String,
        enum: [
          "United States",
          "Canada",
          "United Kingdom",
          "Europe",
          "Asia",
          "Australia / NZ",
          "Other",
        ],
        default: null,
      },
      paymentMethod: { type: String, default: "" },
      sizes: {
        menswear: {
          Tops: [{ type: String, enum: clothingSizes }],
          Bottoms: [{ type: String, enum: clothingSizes }],
          Outerwear: [{ type: String, enum: clothingSizes }],
          Footwear: [{ type: String, enum: footwearSizes }],
          Tailoring: [{ type: String, enum: clothingSizes }],
        },
        womenswear: {
          Tops: [{ type: String, enum: clothingSizes }],
          Bottoms: [{ type: String, enum: clothingSizes }],
          Outerwear: [{ type: String, enum: clothingSizes }],
          Footwear: [{ type: String, enum: footwearSizes }],
          Dresses: [{ type: String, enum: clothingSizes }],
        },
      },
      lastUsernameChange: { type: Date },
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
    pendingEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },

    pendingEmailToken: {
      type: String,
      index: true,
      default: null,
    },

    pendingEmailExpires: {
      type: Date,
      default: null,
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
