import cron from "node-cron";
import User from "../models/User.js";

const runCleanupJob = () => {
  cron.schedule("0 * * * *", async () => {
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await User.deleteMany({
      authProvider: "google",
      username: null,
      signupIncompleteAt: { $lt: expired },
    });

    if (result.deletedCount > 0) {
      console.log(`🧹 Deleted ${result.deletedCount} ghost user(s)`);
    }
  });
};

export default runCleanupJob;
