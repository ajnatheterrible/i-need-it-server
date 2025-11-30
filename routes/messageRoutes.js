import express from "express";
import {
  sendMessage,
  getThreadMessages,
  getInbox,
  markAsRead,
  getUnreadCount,
} from "../controllers/messageController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

router.post("/", requireAuth, sendMessage);
router.get("/inbox", requireAuth, getInbox);
router.get("/unread-count", requireAuth, getUnreadCount);
router.get("/thread/:threadId", requireAuth, getThreadMessages);
router.put("/:threadId/read", requireAuth, markAsRead);

export default router;
