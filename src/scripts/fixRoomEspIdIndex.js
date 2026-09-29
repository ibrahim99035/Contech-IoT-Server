/**
 * One-time (but idempotent) index migration for the Room collection.
 *
 * Room.esp_id was declared as `unique: true`. Mongoose turned that into a plain
 * unique index, and a non-sparse unique index indexes every document that lacks
 * the field as `null`. Since rooms only get an esp_id once an ESP is paired, all
 * unpaired rooms collided on a single `null` key, so creating the second room
 * failed with:
 *
 *   E11000 duplicate key error collection: <db>.rooms index: esp_id_1
 *   dup key: { esp_id: null }
 *
 * The schema now declares a partial unique index that only applies to documents
 * whose esp_id is a string. Mongoose will not replace an existing index that has
 * the same name but different options, so on any database created before that
 * change the stale index must be dropped explicitly. This script does that and
 * then lets Mongoose build the correct one.
 *
 * Safe to run repeatedly; it is a no-op once the index is already correct.
 *
 * Usage: npm run fix:room-esp-index
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Room = require('../models/Room');

const INDEX_NAME = 'esp_id_1';
const EXPECTED = {
  unique: true,
  partialFilterExpression: { esp_id: { $type: 'string' } },
};

function isCurrentIndex(index) {
  if (!index || index.unique !== true) return false;
  const filter = index.partialFilterExpression;
  return !!filter && filter.esp_id && filter.esp_id.$type === 'string';
}

async function run() {
  await connectDB();

  const collection = mongoose.connection.collection(Room.collection.name);
  const existing = await collection.indexes();
  const current = existing.find((i) => i.name === INDEX_NAME);

  if (!current) {
    await Room.syncIndexes();
    console.log('[fixRoomEspIdIndex] no esp_id index found; created the partial unique index');
    return;
  }

  if (isCurrentIndex(current)) {
    console.log('[fixRoomEspIdIndex] esp_id index is already the partial unique index; nothing to do');
    return;
  }

  console.log(
    `[fixRoomEspIdIndex] dropping stale esp_id index (unique=${!!current.unique}, ` +
      `partial=${current.partialFilterExpression ? 'yes' : 'none'})`
  );
  await collection.dropIndex(INDEX_NAME);
  await Room.syncIndexes();

  const after = (await collection.indexes()).find((i) => i.name === INDEX_NAME);
  if (!isCurrentIndex(after)) {
    throw new Error(
      `esp_id index was not replaced correctly: ${JSON.stringify(
        after && { unique: after.unique, partialFilterExpression: after.partialFilterExpression }
      )}`
    );
  }
  console.log('[fixRoomEspIdIndex] done; esp_id uniqueness now only applies to paired rooms');
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[fixRoomEspIdIndex] failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  });
