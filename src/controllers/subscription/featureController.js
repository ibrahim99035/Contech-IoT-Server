const { Feature } = require('../../models/subscriptionSystemModels');

// Create a new feature
exports.createFeature = async (req, res) => {
  try {
    const { name, description } = req.body;

    const feature = new Feature({ name, description });
    await feature.save();

    res.status(201).json({ success: true, data: feature });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get all features
exports.getFeatures = async (req, res) => {
  try {
    const features = await Feature.find();
    res.status(200).json({ success: true, data: features });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};