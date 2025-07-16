const mongoose = require('mongoose');
const SubscriptionLimits = require('../models/SubscriptionLimits');
const { SubscriptionPlan, Feature } = require('../models/subscriptionSystemModels'); // Adjust path as needed

// Features data
const defaultFeatures = [
  { name: 'Basic Support', description: 'Email support during business hours' },
  { name: 'Premium Support', description: '24/7 priority support via email and chat' },
  { name: 'Advanced Analytics', description: 'Detailed analytics and reporting dashboard' },
  { name: 'Custom Integrations', description: 'Connect with third-party services' },
  { name: 'Multi-user Access', description: 'Multiple team members can access the account' },
  { name: 'API Access', description: 'Full API access for custom integrations' },
  { name: 'White-label Options', description: 'Customize branding and interface' },
  { name: 'Advanced Security', description: 'Enhanced security features and compliance' }
];

// Subscription Plans data
const defaultPlans = [
  {
    name: 'free',
    description: 'Basic plan with essential features',
    price: 0,
    billingCycle: 'monthly',
    features: ['Basic Support'],
    trialPeriod: 0,
    status: 'active'
  },
  {
    name: 'gold',
    description: 'Advanced plan for power users',
    price: 29.99,
    billingCycle: 'monthly',
    features: ['Premium Support', 'Advanced Analytics', 'Multi-user Access'],
    trialPeriod: 14,
    status: 'active'
  },
  {
    name: 'platinum',
    description: 'Premium plan with maximum features',
    price: 99.99,
    billingCycle: 'monthly',
    features: ['Premium Support', 'Advanced Analytics', 'Custom Integrations', 'Multi-user Access', 'API Access', 'White-label Options', 'Advanced Security'],
    trialPeriod: 30,
    status: 'active'
  }
];

// Subscription Limits data
const defaultLimits = [
  {
    planName: 'free',
    limits: {
      apartments: { owned: 1, memberships: 2 },
      rooms: { perApartment: 3 },
      devices: { perRoom: 2 },
      tasks: { perDevice: 5, totalPerUser: 10 }
    },
    description: 'Basic plan with essential features'
  },
  {
    planName: 'gold',
    limits: {
      apartments: { owned: 3, memberships: 5 },
      rooms: { perApartment: 8 },
      devices: { perRoom: 6 },
      tasks: { perDevice: 15, totalPerUser: 50 }
    },
    description: 'Advanced plan for power users'
  },
  {
    planName: 'platinum',
    limits: {
      apartments: { owned: 10, memberships: 20 },
      rooms: { perApartment: 20 },
      devices: { perRoom: 15 },
      tasks: { perDevice: 50, totalPerUser: 200 }
    },
    description: 'Premium plan with maximum features'
  }
];

async function seedFeatures() {
  const existingFeatures = await Feature.countDocuments();
  
  if (existingFeatures > 0) {
    console.log(`Features already exist (${existingFeatures} features found). Skipping features seed.`);
    return;
  }
  
  console.log('No features found. Seeding default features...');
  
  for (const feature of defaultFeatures) {
    const createdFeature = await Feature.create(feature);
    console.log(`Created feature: ${createdFeature.name}`);
  }
  
  console.log('Features seeded successfully');
}

async function seedSubscriptionPlans() {
  console.log('Checking subscription plans...');
  
  for (const plan of defaultPlans) {
    const existingPlan = await SubscriptionPlan.findOne({ name: plan.name });
    
    if (existingPlan) {
      console.log(`Plan "${plan.name}" already exists, skipping`);
      continue;
    }
    
    const createdPlan = await SubscriptionPlan.create(plan);
    console.log(`Created subscription plan: ${createdPlan.name} - ${createdPlan.price}`);
  }
  
  console.log('Subscription plans seeding completed');
}

async function seedSubscriptionLimits() {
  console.log('Checking subscription limits...');
  
  for (const limit of defaultLimits) {
    const existingLimit = await SubscriptionLimits.findOne({ planName: limit.planName });
    
    if (existingLimit) {
      console.log(`Limit for "${limit.planName}" already exists, skipping`);
      continue;
    }
    
    const createdLimit = await SubscriptionLimits.create(limit);
    console.log(`Created subscription limit: ${createdLimit.planName}`);
  }
  
  console.log('Subscription limits seeding completed');
}

async function seedAll() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('Starting subscription system seeding...');
    
    // Seed in order: Features -> Plans -> Limits
    await seedFeatures();
    await seedSubscriptionPlans();
    await seedSubscriptionLimits();
    
    console.log('All subscription system data seeded successfully');
    
  } catch (error) {
    console.error('Error seeding subscription system:', error);
    throw error;
  }
}

// For direct execution
if (require.main === module) {
  seedAll()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedAll;