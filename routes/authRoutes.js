import express from "express";
import passport from "passport";
import rateLimit from "express-rate-limit";

import {
  registerUser,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  validateResetToken,
  refreshAccessToken,
} from "../controllers/authController.js";

import {
  handleGoogleCallback,
  patchUser,
  cancelGoogleSignup,
} from "../controllers/oauthController.js";

import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { message: "Too many attempts. Please try again later." },
});

const shorterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { message: "Too many reset attempts. Please wait and try again." },
});

// Local auth
router.post("/register", limiter, registerUser);
router.post("/login", limiter, loginUser);
router.post("/logout", logoutUser);

// Refresh token
router.post("/refresh", refreshAccessToken);

// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate("google", { session: false }, (err, user) => {
      if (err) {
        if (err.name === "LocalEmailExists") {
          return res.redirect(
            "http://localhost:5173/?error=login_type_mismatch"
          );
        }

        return res.redirect("http://localhost:5173/?error=oauth_unknown_error");
      }

      if (!user) {
        return res.redirect("http://localhost:5173/?error=oauth_no_user");
      }

      req.user = user;
      next();
    })(req, res, next);
  },
  handleGoogleCallback
);

router.post("/cancel-google-signup", requireAuth, cancelGoogleSignup);
router.patch("/complete-signup", requireAuth, patchUser);

// Password reset
router.post("/request-password-reset", requestPasswordReset);
router.post("/validate-reset-token", validateResetToken);
router.post("/reset-password", resetPassword);

export default router;
