
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const User = require('../models/user');
const { Conversation, Message } = require('../models/conversation');

// Load character system prompts from constants.json
const constantsPath = path.join(__dirname, '../constants.json');
const characterPrompts = JSON.parse(fs.readFileSync(constantsPath, 'utf-8')).characters;

// Create a new conversation and save the first user prompt
exports.createConversation = async function (req, res) {
	try {
		const userId = req.user._id;
		const { prompt, character } = req.body;
		if (!prompt || !character) {
			return res.status(400).json({ success: false, message: 'Prompt and character are required.' });
		}

		// Get system prompt for character
		const systemPrompt = characterPrompts[character];
		if (!systemPrompt) {
			return res.status(400).json({ success: false, message: 'Invalid character.' });
		}

		// Create conversation
		const conversation = new Conversation({ user: userId, messages: [] });
		await conversation.save();

		// Save user message
		const userMsg = await Message.create({
			conversation: conversation._id,
			sender: 'user',
			content: prompt
		});
		conversation.messages.push(userMsg._id);
		await conversation.save();

		return res.status(201).json({ success: true, conversationId: conversation._id });
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Error creating conversation', error: err.message });
	}
};

// Stream response for the first prompt in a conversation
exports.streamFirstPromptResponse = async function (req, res) {
	try {
		const userId = req.user._id;
		const { conversationId, character, prompt } = req.body;
		if (!conversationId || !character || !prompt) {
			return res.status(400).json({ success: false, message: 'conversationId, character, and prompt are required.', isFalse:true });
		}

		// Get user and check message count/plan
		const user = await User.findById(userId);
		if (!user) {
			return res.status(401).json({ success: false, message: 'User not found.' });
		}
		if (user.plan === 'basic' && user.messageCount >= 5) {
			res.header('X-Limit-Reached', 'true');
			return res.status(403).json({ success: false, message: 'Message limit reached. Please upgrade your plan.', isFalse:true  });
		}

		// Get system prompt for character
		const systemPrompt = characterPrompts[character];
		if (!systemPrompt) {
			return res.status(400).json({ success: false, message: 'Invalid character.', isFalse:true  });
		}

		// Prepare DeepSeek API request
		const apiUrl = 'https://api.deepseek.com/v1/chat/completions';
		const apiKey = process.env.DEEPSEEK_API_KEY;
		if (!apiKey) {
			return res.status(500).json({ success: false, message: 'DeepSeek API key not configured.' });
		}

		// Compose messages for DeepSeek: include system prompt, previous messages from the conversation (if any), then the current user prompt
		let messages = [ { role: 'system', content: systemPrompt } ];
		messages.push({ role: 'user', content: prompt });

		// Stream response from DeepSeek
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Transfer-Encoding', 'chunked');

		// Axios streaming with responseType: 'stream'
		const response = await axios.post(apiUrl, {
			model: 'deepseek-chat',
			messages,
			stream: true
		}, {
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			responseType: 'stream'
		});

		// Increment message count
		user.messageCount += 1;
		await user.save();

		// Save bot message as it streams
		let botContent = '';
		let buffer = '';
		response.data.on('data', async (chunk) => {
			// Convert the chunk to a string and append to the buffer
			buffer += chunk.toString();

			// The stream provides data in Server-Sent Events (SSE) format,
			// with each event separated by two newlines.
			const lines = buffer.split('\n');
			buffer = lines.pop(); // Keep the last, possibly incomplete, line in the buffer

			for await (const line  of lines) {
				// DeepSeek's streaming API wraps JSON in `data: ` prefix.
				if (line.startsWith('data: ')) {
					const jsonStr = line.substring(5).trim();
					if (jsonStr === '[DONE]') {
						// Save bot message
						const conversation = await Conversation.findById(conversationId);
						if (conversation) {
							const botMsg = await Message.create({
								conversation: conversation._id,
								sender: 'bot',
								content: botContent || "Empty response from bot."
							});
							conversation.messages.push(botMsg._id);
							await conversation.save();
						}
						res.end(); // End the response to the client
						// Save the final `botContent` to your database here if needed.
						return;
					}

					try {
						const jsonObj = JSON.parse(jsonStr);
						const content = jsonObj.choices?.[0]?.delta?.content || "";

						// Only send non-empty content to the client
						if (content) {
							botContent += content;
							res.write(content);
						}
					} catch (error) {
						console.error('Error parsing JSON from stream:', error);
					}
				}
			}
		});
		response.data.on('end', async () => {
			
			res.end();
		});
		response.data.on('error', (err) => {
			res.write(JSON.stringify({ success: false, message: 'Error streaming from DeepSeek', error: err.message }));
			res.end();
		});
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Error streaming first prompt', error: err.message, isFalse:true  });
	}
};

// Controller to handle prompt, stream DeepSeek API response, and enforce limits
exports.sendPrompt = async function (req, res) {
	try {
		const userId = req.user._id;
		const { prompt, character, conversationId } = req.body;
		if (!prompt || !character) {
			return res.status(400).json({ success: false, message: 'Prompt and character are required.', isFalse:true  });
		}

		// Get user and check message count/plan
		const user = await User.findById(userId);
		if (!user) {
			return res.status(401).json({ success: false, message: 'User not found.', isFalse:true  });
		}
		if (user.plan === 'basic' && user.messageCount >= 5) {
			res.header('X-Limit-Reached', 'true');
			return res.status(403).json({ success: false, message: 'Message limit reached. Please upgrade your plan.', isFalse:true  });
		}

		// Get system prompt for character
		const systemPrompt = characterPrompts[character];
		if (!systemPrompt) {
			return res.status(400).json({ success: false, message: 'Invalid character.', isFalse:true  });
		}

		// Prepare DeepSeek API request
		const apiUrl = 'https://api.deepseek.com/v1/chat/completions'; // Replace with actual DeepSeek endpoint
		const apiKey = process.env.DEEPSEEK_API_KEY;
		if (!apiKey) {
			return res.status(500).json({ success: false, message: 'DeepSeek API key not configured.', isFalse:true  });
		}

		// Load existing conversation (if provided) so we can include prior messages as context
		let conversation = null;
		if (conversationId) {
			conversation = await Conversation.findById(conversationId);
		}

		// Compose messages for DeepSeek: system prompt, prior messages, then current prompt
		let messages = [ { role: 'system', content: systemPrompt } ];

		if (conversation && conversation.messages && conversation.messages.length > 0) {
			const priorMessages = await Message.find({ conversation: conversation._id })
				.sort({ createdAt: 1 })
				.select('sender content createdAt');

			for (const m of priorMessages) {
				messages.push({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.content });
			}
		}

		// Finally add the current user prompt
		messages.push({ role: 'user', content: prompt });

		// Stream response from DeepSeek
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('Transfer-Encoding', 'chunked');

		// Axios streaming with responseType: 'stream'
		const response = await axios.post(apiUrl, {
			model: 'deepseek-chat',
			messages,
			stream: true
		}, {
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			responseType: 'stream'
		});

		// Increment message count
		user.messageCount += 1;
		await user.save();

		// Ensure conversation exists in DB (reuse the conversation we may have loaded earlier)
		if (!conversation) {
			conversation = new Conversation({ user: userId, messages: [] });
			await conversation.save();
		}
		const userMsg = await Message.create({
			conversation: conversation._id,
			sender: 'user',
			content: prompt
		});
		conversation.messages.push(userMsg._id);
		await conversation.save();

		// Stream DeepSeek response and save bot message
		let botContent = '';
		let buffer = '';
		response.data.on('data', async (chunk) => {
			// Convert the chunk to a string and append to the buffer
			buffer += chunk.toString();

			// The stream provides data in Server-Sent Events (SSE) format,
			// with each event separated by two newlines.
			const lines = buffer.split('\n');
			buffer = lines.pop(); // Keep the last, possibly incomplete, line in the buffer

			for await (const line  of lines) {
				// DeepSeek's streaming API wraps JSON in `data: ` prefix.
				if (line.startsWith('data: ')) {
					const jsonStr = line.substring(5).trim();
					if (jsonStr === '[DONE]') {
						// Save bot message
						const conversation = await Conversation.findById(conversationId);
						if (conversation) {
							const botMsg = await Message.create({
								conversation: conversation._id,
								sender: 'bot',
								content: botContent || "Empty response from bot."
							});
							conversation.messages.push(botMsg._id);
							await conversation.save();
						}
						res.end(); // End the response to the client
						// Save the final `botContent` to your database here if needed.
						return;
					}

					try {
						const jsonObj = JSON.parse(jsonStr);
						const content = jsonObj.choices?.[0]?.delta?.content || "";

						// Only send non-empty content to the client
						if (content) {
							botContent += content;
							res.write(content);
						}
					} catch (error) {
						console.error('Error parsing JSON from stream:', error);
					}
				}
			}
		});
		response.data.on('end', async () => {
			res.end();
		});
		response.data.on('error', (err) => {
			res.write(JSON.stringify({ success: false, message: 'Error streaming from DeepSeek', error: err.message, isFalse:true  }));
			res.end();
		});
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Error processing prompt', error: err.message, isFalse:true  });
	}
};

// Get all conversations for a user (chat history)
exports.getUserConversations = async function (req, res) {
	try {
		const userId = req.user._id;
		const conversations = await Conversation.find({ user: userId })
			.populate({
				path: 'messages',
				select: 'sender content createdAt',
				options: { sort: { createdAt: 1 } }
			})
			.sort({ updatedAt: -1 });
		return res.status(200).json({ success: true, conversations });
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Error fetching conversations', error: err.message });
	}
};

// Delete a conversation by ID
exports.deleteConversation = async function (req, res) {
	try {
		const conversationId = req.params.id;
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ success: false, message: 'Conversation not found' });
		}
		// Remove all messages in the conversation
		await Message.deleteMany({ conversation: conversationId });
		// Remove the conversation itself
		await Conversation.findByIdAndDelete(conversationId);
		return res.status(200).json({ success: true, message: 'Conversation deleted' });
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Error deleting conversation', error: err.message });
	}
};

// Get all messages in a conversation
exports.getMessages = async function (req, res) {
	try {
		const conversationId = req.params.id;
		const messages = await Message.find({ conversation: conversationId })
			.sort({ createdAt: 1 });
		return res.status(200).json({ success: true, messages });
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Error fetching messages', error: err.message });
	}
};
