import express from "express";
import multer from "multer";
import * as marketController from "../controllers/marketController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
    }
  },
});

router.post(
  "/upload-image",
  upload.single("file"),
  marketController.uploadImage
);
router.post("/upload-listing", requireAuth, marketController.uploadListing);
router.patch("/patch-listing", requireAuth, marketController.patchListing);
router.delete("/delete-draft", requireAuth, marketController.deleteDraft);

export default router;
