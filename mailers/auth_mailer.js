const nodeMailer = require('../config/nodemailer');
require('dotenv').config();

// Send password change alert email
exports.passwordChangeAlertMail = async (user) => {
    try {
        // Render template
        const mailContent = await nodeMailer.renderTemplate(
            { user: user },
            '/auth/password_change_alert.ejs'
        );

        // Send email using the wrapper function
        await nodeMailer.sendMail({
            from: {
                name: 'Express Auth Admin',
                address: process.env.SMTP_USER
            },
            to: user.email,
            subject: 'Password Change Alert',
            html: mailContent
        });

        console.log('Password change alert email sent successfully to:', user.email);
    } catch (error) {
        console.error('Failed to send password change alert:', error);
        throw error; // Re-throw to handle in the controller
    }
};

// Send password reset link email
exports.passwordResetLinkMail = async (user) => {
    try {
        // Render template
        const mailContent = await nodeMailer.renderTemplate(
            { user: user },
            '/auth/password_reset_link.ejs'
        );

        // Send email using the wrapper function
        await nodeMailer.sendMail({
            from: process.env.SMTP_USER,
            to: user.email,
            subject: 'Password Reset Request',
            html: mailContent
        });

        console.log('Password reset link email sent successfully to:', user.email);
    } catch (error) {
        console.error('Failed to send password reset link:', error);
        throw error; // Re-throw to handle in the controller
    }
};
