// Import necessary modules
require('dotenv').config(); // loads environment variables from a .env file
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
const customMiddleware = require('./config/middleware');
const db = require('./config/mongoose');
const passportLocal = require('./config/passport-local');
const passportGoogle = require('./config/passport-google');
const cors = require('cors');
const helmet = require('helmet');

// Start scheduled jobs (reset messageCount) only if not in test env
if (process.env.NODE_ENV !== 'test') {
    require('./tasks/resetMessageCount');
}


// Create an express application
const app = express();


// Security headers
app.use(helmet());

// Stripe webhook (must be before express.json!)
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), require('./controllers/payment_controller').handleWebhook);


app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    optionsSuccessStatus: 204,
    exposedHeaders: ['X-Limit-Reached'],
}));
app.use(express.json());


 // Configure the express application
// app.set('view engine', 'ejs'); // set the view engine to EJS
// app.set('views', path.join(__dirname, 'views')); // set the views directory path
// app.set('layout extractStyles', true); // extract styles from layout
// app.set('layout extractScripts', true); // extract scripts from layout
// app.use(expressLayouts); // use express-ejs-layouts for rendering views

// Configure session middleware
app.use(
    session({
        name: 'auth-cookies',
        secret: process.env.SESSION_KEY,
        saveUninitialized: false,
        resave: false,
        cookie: {
            maxAge: 1000 * 60 * 100,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        },
        store: MongoStore.create({
            mongoUrl: process.env.DB_CONNECTION,
            autoRemove: 'disabled',
        }),
    })
);

// Initialize passport and set user authentication middleware
app.use(passport.initialize());
app.use(passport.session());
app.use(passport.setAuthenticatedUser);

// // Use flash middleware to display flash messages
// app.use(flash());

// Use middleware to parse request body and cookies
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


// Use routes
app.use('/api', require('./routes'));


// Global error handlers for production reliability
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

app.listen(process.env.PORT, (err) => {
    if (err) {
        console.error('Error while running server!', err);
    }
    console.log(`Server running on port ${process.env.PORT} [${process.env.NODE_ENV || 'development'}]`);
});
