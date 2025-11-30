import cron from "node-cron";
import Offer from "../models/Offer.js";
import User from "../models/User.js";
import Message from "../models/Message.js";

cron.schedule("0 * * * *", async () => {
  const now = new Date();

  const expiredOffers = await Offer.find({
    status: "pending",
    expiresAt: { $ne: null, $lte: now },
  });

  if (!expiredOffers.length) return;

  for (const offer of expiredOffers) {
    if (offer.mode === "buyer" && offer.fundsHeld) {
      await User.updateOne(
        { _id: offer.buyer },
        { $inc: { virtualBalanceCents: offer.total_cents } }
      );
    }

    await Offer.updateOne(
      { _id: offer._id },
      {
        status: "expired",
        fundsHeld: false,
        respondedAt: now,
      }
    );

    const msg = await Message.findOne({
      offer: offer._id,
      type: "offer",
    });

    if (msg) {
      msg.offerSnapshot.status = "expired";
      await msg.save();
    }
  }

  console.log(
    `[Offer Expiry Job] Marked ${expiredOffers.length} offers as expired`
  );
});
