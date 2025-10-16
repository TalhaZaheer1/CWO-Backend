const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/user');

// Create a subscription Checkout session for premium plan
exports.createCheckoutSession = async function (req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID, // Premium plan recurring price ID from Stripe
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            subscription_data: {
                metadata: {
                    userId: req.user._id.toString()
                }
            },
            success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/payment-cancelled`,
            client_reference_id: req.user._id.toString(), // To identify the user in webhook
        });

        res.json({ success: true, sessionId: session.id, url: session.url });
    } catch (err) {
        console.error('Stripe checkout error:', err);
        res.status(500).json({ success: false, message: 'Error creating checkout session', error: err.message });
    }
};

// Webhook handler for Stripe events (subscription lifecycle)
exports.handleWebhook = async function (req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        // Handle completed Checkout Session for subscriptions
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;

            // Only handle subscription sessions
            if (session.mode === 'subscription' || session.subscription) {
                const subscriptionId = session.subscription;
                const userId = session.client_reference_id || (session.metadata && session.metadata.userId);

                if (userId) {
                    // Save subscription id on user and set plan to premium
                    await User.findByIdAndUpdate(userId, {
                        plan: 'premium',
                        messageCount: 0,
                        stripeSubscriptionId: subscriptionId
                    });
                }

                // Immediately schedule the subscription to cancel at period end so it won't auto-renew
                if (subscriptionId) {
                    try {
                        await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
                        console.log(`Scheduled subscription ${subscriptionId} to cancel at period end`);
                    } catch (err) {
                        console.error('Error scheduling subscription cancellation:', err);
                    }
                }
            }
        }

        // Handle subscription deletion or cancellation events
        if (event.type === 'customer.subscription.deleted' || (event.type === 'customer.subscription.updated')) {
            const subscription = event.data.object;

            // If it's an update event, check if the status is 'canceled'
            if (event.type === 'customer.subscription.updated' && subscription.status !== 'canceled') {
                // Not a cancellation update; ignore
            } else {
                // Try to find the user via subscription metadata, then fallback to searching by stored stripeSubscriptionId
                const userId = (subscription.metadata && subscription.metadata.userId) || null;
                let user = null;

                if (userId) {
                    user = await User.findById(userId);
                }

                if (!user) {
                    user = await User.findOne({ stripeSubscriptionId: subscription.id });
                }

                if (user) {
                    user.plan = 'basic';
                    user.stripeSubscriptionId = undefined;
                    // Optionally reset messageCount or other fields here
                    await user.save();
                    console.log(`Downgraded user ${user._id} to basic due to subscription cancellation`);
                } else {
                    console.warn('Could not find user for canceled subscription:', subscription.id);
                }
            }
        }
    } catch (err) {
        console.error('Error processing webhook event:', err);
        return res.status(500).send('Webhook handler error');
    }

    res.json({ received: true });
};

// Verify session status (for subscription sessions return subscription status)
exports.verifySession = async function (req, res) {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

        // If this session created a subscription, retrieve and return its status
        if (session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            return res.json({
                success: true,
                message: 'Subscription session retrieved',
                status: subscription.status,
                subscriptionId: subscription.id
            });
        }

        // Fallback to payment status for non-subscription sessions
        if (session.payment_status === 'paid') {
            return res.json({
                success: true,
                message: 'Payment was successful',
                status: session.payment_status
            });
        }

        res.json({
            success: false,
            message: 'Payment/subscription was not successful',
            status: session.payment_status || 'unknown'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error verifying payment/subscription', error: err.message });
    }
};