import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";
import createError from "../utils/createError.js";

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email)
          return done(new Error("Missing email from Google profile"), false);

        const existingUser = await User.findOne({ googleId: profile.id });
        if (existingUser) return done(null, existingUser);

        const existingByEmail = await User.findOne({ email });
        if (existingByEmail && !existingByEmail.googleId) {
          const err = createError("Email already registered locally", 409);
          err.name = "LocalEmailExists";
          return done(err, false);
        }

        const newUser = await User.create({
          email,
          googleId: profile.id,
          authProvider: "google",
        });

        return done(null, newUser);
      } catch (err) {
        console.log(err);
        return done(err, false);
      }
    }
  )
);

export const requireUsername = asyncHandler(async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.redirect("/");

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id);

  if (!user || !user.username) {
    return res.redirect("/complete-signup");
  }

  next();
});

export default passport;
