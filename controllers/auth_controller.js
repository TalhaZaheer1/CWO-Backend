// Importing required modules and models
const User = require('../models/user');
const Token = require('../models/token');
const authMailer = require('../mailers/auth_mailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
var validator = require('validator');
var axios = require('axios');


const genJsonResponse = (success, message) => ({ success, message })


const FRONTEND_URL = process.env.FRONTEND_URL

// Create and export createUser function
module.exports.createUser = async function (req, res) {

    console.log('Request Body:', req.body); // Log the request body for debugging
    try {
        // Validate the inputs provided (email, name, password)
        const {
            email,
            name,
            password,
            confirm_password,
        } = req.body;
        let errorMsg = '';
        if (!validator.isEmail(email)) {
            errorMsg += 'Invalid email. ';
        }
        if (validator.isEmpty(name)) {
            errorMsg += 'Name is required. ';
        }
        if (
            validator.isEmpty(password) ||
            validator.isEmpty(confirm_password)
        ) {
            errorMsg += 'Password is required. ';
        }
        if (password !== confirm_password) {
            errorMsg += 'Confirm password should be same as password. ';
        }
        if (errorMsg) {
            console.log('Validation Error:', errorMsg); // Log validation errors for debugging
            return res.status(400).json(genJsonResponse(false, errorMsg));
        }


        // Check if user already exists
        const existingUser = await User.findOne({ email }).exec();
        if (existingUser) {
            return res.status(400).json(genJsonResponse(false, "Email already exists."));
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user and redirect to sign in page
        await User.create({
            email,
            name,
            password: hashedPassword,
        });
        res.json({success: true, message: "User created"});
    } catch (err) {
        console.log('Error:', err);
        return res.status(400).json(genJsonResponse(false, 'Error while signing up, please try again.'));
    }
};

// Getting the user credentials and creating user session
module.exports.createSession = function (req, res) {
    return res.json({success: true, user:req.user});
};

// to logout user using passports's logout method
module.exports.destroySession = function (req, res, next) {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        return res.json({success: true, message: "You have logged out!"});
    });
};


//to update the password once user provide the current and new password
module.exports.updatePassword = async function (req, res) {
    try {
        if (req.body.new_password != req.body.confirm_new_password) {
            return res.status(400).json(genJsonResponse(false, "Confirm password should be same."));
        }
        let user = await User.findOne({ _id: req.user.id })
            .select('+password')
            .exec();

        console.log(user)

        let macthPasswrrd = await bcrypt.compare(
            req.body.current_password,
            user.password
        );

        if (!macthPasswrrd) {
            // req.flash('error', 'Invalid password.');
            return res.status(400).json(genJsonResponse(false, "Invalid password."));
        }

        const hashedPassword = await bcrypt.hash(req.body.new_password, 10);

        let updatedUser = await User.findOneAndUpdate(
            { _id: user.id },
            { password: hashedPassword }
        ).exec();

        if (updatedUser) {
            // req.flash('success', 'Password updated.');
            authMailer.passwordChangeAlertMail(user);
            return res.json(genJsonResponse(true, "Passoword updated."));
        }
    } catch (err) {
        console.log('Error : ', err);
        return res.status(400).json(genJsonResponse(false, err.message));
    }
};

// module.exports.forgotPassword = function (req, res) {
//     if (req.isAuthenticated()) {
//         return res.redirect('/');
//     }
//     return res.render('forgot_password');
// };

module.exports.sendPasswordResetLink = async function (req, res) {
    if (req.isAuthenticated()) {
        return res.redirect(FRONTEND_URL);
    }
    try {
        let validationError = '';
        if (!validator.isEmail(req.body.email)) {
            validationError = validationError + 'Invalid email. ';
        }

        if (!!validationError) {
            // req.flash('error', validationError);
            return res.status(400).json(genJsonResponse(false, validationError));
        }


        let user = await User.findOne({ email: req.body.email }).exec();
        if (user) {
            let token = await Token.findOne({ userId: user._id });
            if (token) await token.deleteOne();
            let resetToken = crypto.randomBytes(32).toString('hex');
            await new Token({
                user: user._id,
                token: resetToken,
                createdAt: Date.now(),
            }).save();
            // let baseURL = process.env.BASE_URL;
            user.resetLink = `${FRONTEND_URL}/reset-password?id=${user._id}&key=${resetToken}`;
            authMailer.passwordResetLinkMail(user);
            res.json(genJsonResponse(true, 'An email has been sent to mailbox. please follow the instructions to reset your password.'
            ))
        } else {
            res.status(400).json(genJsonResponse(false, `Email is not registered with us. Please retry will correct email.`))
        }
    } catch (err) {
        console.log('Error : ', err);
        res.status(500).json(genJsonResponse(false, err.message))
    }
};

// Get authenticated user's information
module.exports.getUserInfo = async function (req, res) {
    try {
        if (!req.user) {
            return res.status(401).json(genJsonResponse(false, 'User not authenticated'));
        }

        const user = await User.findById(req.user._id).select('-password').exec();
        if (!user) {
            return res.status(404).json(genJsonResponse(false, 'User not found'));
        }

        return res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                plan: user.plan,
                messageCount: user.messageCount
            }
        });
    } catch (err) {
        console.log('Error : ', err);
        return res.status(500).json(genJsonResponse(false, err.message));
    }
};

// This function is used to verify and set the new password for a user based on the reset token they received.
module.exports.verifyAndSetNewPassword = async function (req, res) {
    try {
        // Extracting the required data from request body.
        const { id, key, new_password, confirm_new_password } = req.body;

        // Finding if the reset token is valid and belongs to the user.
        const isTokenValid = await Token.findOne({
            user: id,
            token: key,
        }).exec();

        // If token is not valid, displaying an error message and redirecting to the previous page.
        if (!isTokenValid) {
            return res.status(400).json(genJsonResponse(false, 'Password reset link expired, please try again.'
            ));
        }

        // Checking if new password and confirm password fields match.
        if (new_password !== confirm_new_password) {
            return res.status(400).json(genJsonResponse(false, 'Confirm password should be same.'))
        }

        // Hashing password before saving
        let newPasswordHash = await bcrypt.hash(new_password, 10);

        // Updating the user's password in the database.
        const updatedUser = await User.findOneAndUpdate(
            { _id: id },
            { password: newPasswordHash }
        ).exec();

        // Deleting the reset token from the database as it is not required anymore.
        await Token.findByIdAndDelete(isTokenValid._id);

        // Sending email to the user to notify them of password change.
        const user = await User.findById(id);

        authMailer.passwordChangeAlertMail(user);

        // Redirecting the user to the login page.
        return res.json(genJsonResponse(true, "Password changed successfully."));
    } catch (err) {
        // Displaying error in console if there is any error while performing the above operations.
        console.log('Error : ', err);
        res.status(500).json(genJsonResponse(false, err.message))
    }
};
