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
    virtualBalanceCents: {
      type: Number,
      default: 500000,
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
      paymentMethods: [
        {
          cardType: {
            type: String,
            enum: ["Visa", "Mastercard", "Amex", "Discover"],
            required: true,
          },
          last4: {
            type: String,
            required: true,
            minlength: 4,
            maxlength: 4,
          },
          expMonth: {
            type: Number,
            min: 1,
            max: 12,
            required: true,
          },
          expYear: {
            type: Number,
            required: true,
          },
          isDefault: {
            type: Boolean,
            default: false,
          },
          addedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
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

  if (
    this.isNew &&
    (!this.settings.paymentMethods || this.settings.paymentMethods.length === 0)
  ) {
    this.settings.paymentMethods = [
      {
        cardType: "Visa",
        last4: "0699",
        expMonth: 11,
        expYear: 2026,
        isDefault: true,
      },
      {
        cardType: "Mastercard",
        last4: "6219",
        expMonth: 3,
        expYear: 2029,
        isDefault: false,
      },
    ];
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
