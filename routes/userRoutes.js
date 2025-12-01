import express from "express";
import {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  getUserSizes,
  updateUserSizes,
  getForSale,
  isUsernameAvailable,
  isEmailAvailable,
  updatePrivacySettings,
  updateUsername,
  getUserSettings,
  requestEmailChange,
  confirmEmailChange,
  addNewAddress,
  getAddresses,
  deleteAddress,
  editAddress,
  getPurchases,
  getPaymentMethods,
  getOrders,
  getSold,
} from "../controllers/userController.js";

import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

router.get("/sizes", requireAuth, getUserSizes);
router.put("/sizes", requireAuth, updateUserSizes);
router.get("/favorites", requireAuth, getUserFavorites);
router.post("/favorites/:listingId", requireAuth, addFavorite);
router.delete("/favorites/:listingId", requireAuth, removeFavorite);
router.get("/for-sale", requireAuth, getForSale);
router.get("/purchases", requireAuth, getPurchases);
router.get("/sold", requireAuth, getSold);
router.get("/is-username-available", requireAuth, isUsernameAvailable);
router.get("/is-email-available", requireAuth, isEmailAvailable);
router.get("/settings", requireAuth, getUserSettings);
router.put("/update-privacy-settings", requireAuth, updatePrivacySettings);
router.put("/update-username", requireAuth, updateUsername);
router.post("/request-email-change", requireAuth, requestEmailChange);
router.get("/confirm-email-change", confirmEmailChange);
router.get("/addresses", requireAuth, getAddresses);
router.post("/addresses", requireAuth, addNewAddress);
router.put("/addresses/:id", requireAuth, editAddress);
router.delete("/addresses/:id", requireAuth, deleteAddress);
router.get("/payment-methods", requireAuth, getPaymentMethods);
router.get("/orders", requireAuth, getOrders);

export default router;
