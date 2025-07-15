import jwt from "jsonwebtoken";
import User from "../models/User.js";
import createError from "../utils/createError.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { generateRefreshToken } from "../utils/jwt.js";

export const handleGoogleCallback = (req, res) => {
  const refreshToken = generateRefreshToken(req.user._id);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  if (req.user && !req.user.username) {
    res.redirect("http://localhost:5173/complete-signup");
  } else {
    res.redirect("http://localhost:5173/");
  }
};

export const patchUser = asyncHandler(async (req, res) => {
  const user = req.user;

  if (!user) throw createError("Not authenticated", 401);

  const { username } = req.body;

  if (!/^[a-zA-Z0-9]{3,30}$/.test(username)) {
    throw createError(
      "Username must be 3–30 characters, letters and numbers only.",
      400
    );
  }

  const usernameLower = username.toLowerCase();
  const existing = await User.findOne({ usernameLower });
  if (existing) throw createError("Username is already taken.", 400);

  user.username = username;
  user.signupIncompleteAt = undefined;
  await user.save();

  res.status(200).json({ user });
});

export const cancelGoogleSignup = asyncHandler(async (req, res) => {
  const user = req.user;

  if (!user) return res.redirect("/");

  if (user && user.authProvider === "google" && !user.username) {
    await User.deleteOne({ _id: user._id });
  }

  res.status(200).json({ message: "User deleted and logged out." });
});
