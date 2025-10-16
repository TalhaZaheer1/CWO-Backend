const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment_controller');
const passport = require('../config/passport-local');

// Create checkout session
router.post('/create-checkout-session', passport.checkAuthentication, paymentController.createCheckoutSession);

// Webhook handler for Stripe events
// router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.handleWebhook);

// Verify session status
router.get('/verify-session', passport.checkAuthentication, paymentController.verifySession);

module.exports = router;