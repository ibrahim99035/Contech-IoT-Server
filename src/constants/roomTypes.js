/**
 * Canonical room types.
 *
 * This list is the data contract: values are persisted on `Room.type`, so
 * renaming one silently invalidates rooms already stored in the database.
 *
 * It must stay in sync with the room-type options offered by the client at
 * Contech-Client/src/components/rooms/CreateRoomDialog.vue. It is shared by
 * both the Mongoose model and the Joi validator so the two cannot drift apart
 * (they previously declared separate copies, and any value added to one but
 * not the other surfaced as a 500 from the model).
 */
const ROOM_TYPES = [
  'living_room',
  'bedroom',
  'kitchen',
  'bathroom',
  'dining_room',
  'office',
  'garage',
  'balcony',
  'basement',
  'attic',
  'other',
];

const ROOM_TYPE_LABELS = {
  living_room: 'Living Room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  dining_room: 'Dining Room',
  office: 'Office',
  garage: 'Garage',
  balcony: 'Balcony',
  basement: 'Basement',
  attic: 'Attic',
  other: 'Other',
};

module.exports = { ROOM_TYPES, ROOM_TYPE_LABELS };
