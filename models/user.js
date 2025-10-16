const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        plan: {
            type: String,
            enum: ["basic","premium"],
            default: "basic",
            required:true
        },
        messageCount:{
            type: Number,
            default: 0,
            required:true
        },
        stripeSubscriptionId: {
            type: String,
            default: null,
        },
    },
    {
        timeseries: true,
    }
);

const User = mongoose.model('User', userSchema);
module.exports = User;
