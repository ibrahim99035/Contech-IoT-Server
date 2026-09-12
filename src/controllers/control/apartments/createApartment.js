const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { apartmentSchema } = require('../../../validation/apartmentValidation');
const { checkApartmentLimits } = require('../../../middleware/checkSubscriptionLimits');
const { runInTxn } = require('../../../utils/transaction')(mongoose);

exports.createApartment = async (req, res) => {
<<<<<<< Updated upstream
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Validate the incoming request data
=======
  try {
>>>>>>> Stashed changes
    const { error } = apartmentSchema.validate(req.body);
    if (error) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: error.details[0].message });
    }

<<<<<<< Updated upstream
    // The limit check is now handled by middleware
=======
>>>>>>> Stashed changes
    const apartmentData = {
      ...req.body,
      members: [...new Set([req.body.creator, ...(req.body.members || [])])],
    };

<<<<<<< Updated upstream
    const apartment = await Apartment.create([apartmentData], { session });

    await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment[0]._id } }, { session });

    await session.commitTransaction();
    session.endSession();
=======
    let apartment;
    await runInTxn(async (session) => {
      if (session) {
        [apartment] = await Apartment.create([apartmentData], { session });
        await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment._id } }, { session });
      } else {
        apartment = await Apartment.create(apartmentData);
        await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment._id } });
      }
    });
>>>>>>> Stashed changes

    return res.status(201).json({
      success: true,
      data: apartment[0],
      message: 'Apartment created successfully'
    });
<<<<<<< Updated upstream
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    return res.status(500).json({ message: 'Error creating apartment', error: error.message });
=======
  } catch (err) {
    return res.status(500).json({ message: 'Error creating apartment', error: err.message });
>>>>>>> Stashed changes
  }
};
