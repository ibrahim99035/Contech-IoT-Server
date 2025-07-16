const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { apartmentSchema } = require('../../../validation/apartmentValidation');
const { checkApartmentLimits } = require('../../../middleware/checkSubscriptionLimits');

exports.createApartment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Validate the incoming request data
    const { error } = apartmentSchema.validate(req.body);
    if (error) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: error.details[0].message });
    }

    // The limit check is now handled by middleware
    const apartmentData = {
      ...req.body,
      members: [...new Set([req.body.creator, ...(req.body.members || [])])],
    };

    const apartment = await Apartment.create([apartmentData], { session });

    await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment[0]._id } }, { session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      data: apartment[0],
      message: 'Apartment created successfully'
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    return res.status(500).json({ message: 'Error creating apartment', error: error.message });
  }
};