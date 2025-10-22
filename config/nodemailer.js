const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');

// Check required environment variables
const requiredVars = ['SMTP_USER', 'SMTP_PASS'];
requiredVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
});

// define the transporter object for sending emails using nodemailer
let transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // upgrade later with STARTTLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false // accepts self-signed certs
    }
});

// Verify transporter connection
transporter.verify(function(error, success) {
    if (error) {
        console.error('SMTP connection error:', error);
    } else {
        console.log('SMTP server is ready to take our messages');
    }
});

// function for rendering ejs templates
const renderTemplate = async function (data, relativePath) {
    try {
        const template = await new Promise((resolve, reject) => {
            ejs.renderFile(
                path.join(__dirname, '../views/mailers', relativePath),
                data,
                (err, template) => {
                    if (err) reject(err);
                    else resolve(template);
                }
            );
        });
        return template;
    } catch (err) {
        console.error('Template rendering error:', err);
        throw err;
    }
};

// Wrapper for sending mail with better error handling
const sendMail = async (options) => {
    try {
        const result = await transporter.sendMail(options);
        console.log('Email sent successfully:', result.messageId);
        return result;
    } catch (error) {
        console.error('Error sending email:', {
            error: error.message,
            code: error.code,
            command: error.command,
            response: error.response
        });
        throw error;
    }
};

// export the functions for use in other modules
module.exports = {
    transporter: transporter,
    renderTemplate: renderTemplate,
    sendMail: sendMail
};
