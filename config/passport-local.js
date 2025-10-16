// Importing required modules
const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const User = require('../models/user');
const bcrypt = require('bcrypt');
var validator = require('validator');
var axios = require('axios');

// Authentication using passport
passport.use(
    'local', // strategy name
    new localStrategy(
        {
            usernameField: 'email', // username field name
            passReqToCallback: true, // allows access to request object in callback function
        },
        async function (req, email, password, done) {
            // passport authentication callback function
            try {
                if (!validator.isEmail(email)) {
                    // validate email using validator module
                    // req.flash('error', 'Invalid email. '); // flash error message
                    console.log('Invalid email'); // Log invalid email for debugging
                    return done(null, false); // return authentication failure
                }
                // Find user in database by email
                let user = await User.findOne({
                    email: email,
                })
                    .select('+password') // explicitly select password field for comparison
                    .exec();

                // If user not found, flash error message and return authentication failure
                if (!user) {
                    // req.flash('error', 'Invalid Username or Password!');
                    console.log('User not found'); // Log user not found for debugging
                    return done(null, false);
                }

                // Compare password with hashed password in database
                let matchPassword = await bcrypt.compare(
                    password,
                    user.password
                );
                if (!matchPassword) {
                    console.log('Password mismatch'); // Log password mismatch for debugging
                    // If password doesn't match, flash error message and return authentication failure
                    // req.flash('error', 'Invalid Username or Password!');
                    return done(null, false);
                }

                // Return authentication success with user object
                return done(null, user);
            } catch (err) {
                console.log('Error in passport : ', err); // Log error
                return done(err); // Return authentication failure with error object
            }
        }
    )
);

//serilizing user to decide whcih key to be kept in cookies
passport.serializeUser(function (user, done) {
    done(null, user.id);
});

//serilizing user to decide whcih key to be kept in cookies
passport.deserializeUser(async function (id, done) {
    try {
        let user = await User.findById(id).exec();
        return done(null, user);
    } catch (err) {
        console.log('Error in passport : ', err);
        return done(err);
    }
});

passport.checkAuthentication = function (req, res, next) {
    //if user signed in, call the nexyt function
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({success:false,message:"Not Authenticated"}); //if user not signed in
};

passport.setAuthenticatedUser = function (req, res, next) {
    if (req.isAuthenticated()) {
        res.locals.user = req.user;
    }
    return next();
};

module.exports = passport;
