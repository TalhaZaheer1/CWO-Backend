
const express = require('express');
const router = express.Router();
const passport = require('../config/passport-local');
const chatController = require('../controllers/conversation_controller');


// Create a new conversation and save the first user prompt
router.post('/create', passport.checkAuthentication, chatController.createConversation);

// Stream response for the first prompt in a conversation
router.post('/stream-first', passport.checkAuthentication, chatController.streamFirstPromptResponse);

// Send a prompt to the chat bot (streamed response)
router.post('/prompt', passport.checkAuthentication, chatController.sendPrompt);

// Get all conversations for the authenticated user
router.get('/history', passport.checkAuthentication, chatController.getUserConversations);

// Delete a conversation by ID
router.delete('/:id', passport.checkAuthentication, chatController.deleteConversation);

// Get all messages in a conversation
router.get('/:id/messages', passport.checkAuthentication, chatController.getMessages);

module.exports = router;
