const express = require('express');
const router = express.Router();


// Conversation routes
router.use('/conversation', require('./conversation'));

// Auth routes
router.use('/auth', require('./auth'));

// Payment routes
router.use('/payment', require('./payment'));

// You can add more route groups here as needed

module.exports = router;
