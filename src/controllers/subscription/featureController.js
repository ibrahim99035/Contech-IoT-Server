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

// Get a single feature by ID
exports.getFeatureById = async (req, res) => {
  try {
    const feature = await Feature.findById(req.params.id);
    if (!feature) return res.status(404).json({ success: false, message: 'Feature not found' });

    res.status(200).json({ success: true, data: feature });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a feature
exports.deleteFeature = async (req, res) => {
  try {
    const feature = await Feature.findByIdAndDelete(req.params.id);
    if (!feature) return res.status(404).json({ success: false, message: 'Feature not found' });

    res.status(200).json({ success: true, message: 'Feature deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};