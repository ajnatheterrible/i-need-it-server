import jwt from "jsonwebtoken";
import validator from "validator";
import crypto from "crypto";
import { Resend } from "resend";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import { access } from "fs";

const passwordValidationRules = {
  minLength: 6,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
};

// Local auth
export const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  const reserved = [
    "admin",
    "support",
    "me",
    "api",
    "auth",
    "login",
    "logout",
    "signup",
    "terms",
  ];

  if (reserved.includes(username.toLowerCase()))
    throw createError("This username is not allowed", 400);

  if (!username || !email || !password)
    throw createError("All fields are required", 400);

  if (!validator.isAlphanumeric(username))
    throw createError("Username can only contain letters and numbers", 400);

  if (!validator.isEmail(email)) throw createError("Invalid email", 400);

  if (!validator.isStrongPassword(password, passwordValidationRules))
    throw createError(
      "Password must include at least one number, uppercase character, and special character",
      400
    );

  const existsByEmail = await User.findOne({ email });
  if (existsByEmail) throw createError("Email is already registered", 400);

  const existsByUsername = await User.findOne({
    usernameLower: username.toLowerCase(),
  });
  if (existsByUsername) throw createError("Username is already taken", 400);

  const user = await User.create({
    username,
    email,
    password,
    authProvider: "local",
  });

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
    },
    accessToken,
  });
});

export const loginUser = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const email = req.body.email?.toLowerCase();

  if (!email || !password) throw createError("All fields are required", 400);
  if (!validator.isEmail(email)) throw createError("Invalid email format", 400);

  const user = await User.findOne({ email });

  if (!user || user.authProvider !== "local")
    throw createError("Invalid email or password", 401);

  if (!(await user.matchPassword(password)))
    throw createError("Invalid email or password", 401);

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      permissions: user.permissions,
    },
    accessToken,
  });
});

export const logoutUser = (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.status(200).json({ message: "Logged out successfully" });
};

// Refresh token
export const refreshAccessToken = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;

  if (!token) throw createError("No refresh token provided", 401);

  const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
  const user = await User.findById(decoded.id).select("-password");

  if (!user) throw createError("User not found", 401);

  const accessToken = generateAccessToken(user._id);

  res.status(200).json({
    user: {
      _id: user._id,
      username: user.username ?? null,
      email: user.email,
      permissions: user.permissions,
      signupIncompleteAt: user.signupIncompleteAt ?? null,
    },
    accessToken,
  });
});

// Password reset via RESEND
export const requestPasswordReset = asyncHandler(async (req, res) => {
  const email = req.body.email?.toLowerCase();
  if (!email) throw createError("Email is required", 400);

  const user = await User.findOne({ email });
  if (!user || user.authProvider !== "local") {
    return res
      .status(200)
      .json({ message: "If that email exists, a reset link has been sent" });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
  await user.save();

  const resetURL = `http://localhost:5173/forgot-password?token=${rawToken}`;
  if (process.env.NODE_ENV !== "production") {
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "I Need It <noreply@resend.dev>",
    to: [email],
    subject: "Reset your password",
    html: `
      <div style="max-width: 600px; margin: auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 8px; font-family: Arial, sans-serif; background-color: #ffffff;">
        <h2 style="color: #333333;">Reset your password</h2>
        <p style="font-size: 16px; color: #555555;">We received a request to reset your password. Click the button below to proceed. This link will expire in 15 minutes.</p>
        <a href="${resetURL}" style="display: inline-block; padding: 12px 20px; margin-top: 20px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
        <p style="font-size: 14px; color: #999999; margin-top: 30px;">If you didn’t request this, you can safely ignore this email.</p>
        <p style="font-size: 12px; color: #cccccc;">— The I NEED IT Team</p>
      </div>
    `,
  });

  res
    .status(200)
    .json({ message: "If that email exists, a reset link has been sent" });
});

export const validateResetToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw createError("Token is required", 400);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) throw createError("Token is invalid or expired", 400);
  res.status(200).json({ message: "Valid token" });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    throw createError("Token and password are required", 400);

  if (!validator.isStrongPassword(newPassword, passwordValidationRules)) {
    throw createError(
      "Minimum 6 characters, with uppercase, number, and symbol.",
      400
    );
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) throw createError("Invalid or expired reset token", 400);
  if (user.authProvider !== "local")
    throw createError("Reset unavailable for this account", 400);

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  const accessToken = generateAccessToken(user._id);

  res.status(200).json({
    success: true,
    message: "Password has been reset successfully.",
    user,
    accessToken,
  });
});
