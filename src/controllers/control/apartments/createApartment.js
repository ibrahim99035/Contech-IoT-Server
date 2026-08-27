const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { apartmentSchema } = require('../../../validation/apartmentValidation');
const { checkApartmentLimits } = require('../../../middleware/checkSubscriptionLimits');

exports.createApartment = async (req, res) => {
  let session = null;
  let useTransaction = false;

  try {
    // Validate the incoming request data
    const { error } = apartmentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (e) {
      session = null;
      useTransaction = false;
    }

    const apartmentData = {
      ...req.body,
      members: [...new Set([req.body.creator, ...(req.body.members || [])])],
    };

    let apartment;
    if (useTransaction && session) {
      try {
        apartment = await Apartment.create([apartmentData], { session });
        await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment[0]._id } }, { session });
        await session.commitTransaction();
        session.endSession();
        apartment = apartment[0];
      } catch (txError) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        session.endSession();
        // Fallback without transaction if standalone MongoDB doesn't support transactions
        apartment = await Apartment.create(apartmentData);
        await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment._id } });
      }
    } else {
      apartment = await Apartment.create(apartmentData);
      await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment._id } });
    }

    return res.status(201).json({
      success: true,
      data: apartment,
      message: 'Apartment created successfully'
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
      session.endSession();
    }
    return res.status(500).json({ message: 'Error creating apartment', error: error.message });
  }
};