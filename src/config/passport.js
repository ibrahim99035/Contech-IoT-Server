/**
 * Passport.js configuration for Google OAuth
 * This file sets up the Passport strategies for authentication
 */

const passport = require('passport');
const GoogleTokenStrategy = require('passport-google-token').Strategy;
const User = require('../models/User');
const { SubscriptionPlan, Subscription } = require('../models/subscriptionSystemModels');

// Configure Google Token Strategy for mobile OAuth
passport.use(
  new GoogleTokenStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Extract profile information
        const { id, displayName, emails } = profile;
        
        // Check if user exists with this email
        const userEmail = emails[0].value;
        let user = await User.findOne({ email: userEmail });
        
        if (user) {
          // If user exists but doesn't have googleId, add it
          if (!user.googleId) {
            user.googleId = id;
            await user.save();
          }
          return done(null, user);
        }
        
        // Create new user if not exists
        const newUser = new User({
          name: displayName,
          email: userEmail,
          // Generate random password for Google users
          password: Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12),
          role: 'customer', // Default role
          active: true,
          emailActivated: true, // Auto-activate email for Google users
          googleId: id,
        });
        
        await newUser.save();
        
        // Find or create the "free" subscription plan
        let subscriptionPlan = await SubscriptionPlan.findOne({ name: 'free' });
        if (!subscriptionPlan) {
          subscriptionPlan = new SubscriptionPlan({
            name: 'free',
            price: 0,
            billingCycle: 'monthly',
            features: ['Basic support'],
          });
          await subscriptionPlan.save();
        }

        // Create subscription for the user
        const subscription = new Subscription({
          user: newUser._id,
          subscriptionPlan: subscriptionPlan._id,
          status: 'active',
          startDate: new Date(),
        });

        await subscription.save();
        
        return done(null, newUser);
      } catch (error) {
        console.error("Error in Google authentication:", error);
        return done(error, null);
      }
    }
  )
);

module.exports = passport;