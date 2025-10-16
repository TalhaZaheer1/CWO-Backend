// Scheduled task to reset all users' messageCount to 0 every 24 hours
const cron = require('node-cron');
const User = require('../models/user');

// Runs every minute (for testing)
cron.schedule('0 0 * * *', async () => {
  try {
    const result = await User.updateMany({}, { $set: { messageCount: 0 } });
    console.log(`[CRON] Reset messageCount for all users. Matched: ${result.matchedCount || result.n}, Modified: ${result.modifiedCount || result.nModified}`);
  } catch (err) {
    console.error('[CRON] Failed to reset messageCount for users:', err);
  }
});
