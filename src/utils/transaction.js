/**
 * Transaction helper — works on both replica-set and standalone MongoDB.
 *
 * Mongoose sessions/transactions require a replica-set member or mongos.
 * On a standalone server, session.startTransaction() throws:
 *   "Transaction numbers are only allowed on a replica set member or mongos"
 *
 * This helper detects that and runs the work outside any transaction while
 * still returning a (no-op) session object so callers can keep a single code
 * path.  It also cleans up the session in all exit paths.
 *
 * Usage:
 *   const { runInTxn, endSession } = require('../utils/transaction')(mongoose);
 *   await runInTxn(async (session) => {
 *     await Model.create([doc], { session });
 *     await User.updateOne(..., { session });
 *     // commits automatically on success; aborts on thrown error
 *   });
 *   // optionally endSession() when you're done with the session object
 */

'use strict';

const logger = require('../config/logger');

let txnSupported = null; // cached: true | false | null (= undetermined)

/**
 * Try to start a transaction.  Returns { session, inTransaction } where
 * inTransaction is true only when a real transaction is active.
 */
async function beginTransaction(mongoose) {
  if (txnSupported === false) {
    // standalone — skip entirely
    const session = await mongoose.startSession();
    session.endSession();
    return { session: null, inTransaction: false };
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    txnSupported = true;
    return { session, inTransaction: true };
  } catch (err) {
    // Assume standalone / non-supporting server.
    txnSupported = false;
    session.endSession();
    const session2 = await mongoose.startSession();
    session2.endSession();
    return { session: null, inTransaction: false };
  }
}

/**
 * Commit a transaction (no-op when not in one).
 */
async function commitTransaction(session) {
  if (session && session.inTransaction()) {
    await session.commitTransaction();
  }
}

/**
 * Abort a transaction (no-op when not in one), then end the session.
 */
async function abortAndEnd(session) {
  if (session) {
    try {
      if (session.inTransaction()) await session.abortTransaction();
    } catch { /* best-effort */ }
    session.endSession();
  }
}

/**
 * Run `fn(session)` inside a transaction when supported; otherwise run it
 * without a session.  Commits on success, aborts + re-throws on failure.
 */
async function runInTxn(mongoose, fn) {
  const { session, inTransaction } = await beginTransaction(mongoose);
  try {
    await fn(session);
    await commitTransaction(session);
    return;
  } catch (err) {
    await abortAndEnd(session);
    throw err;
  }
}

/**
 * End a session that was obtained via beginTransaction when you don't need
 * it anymore (only effective when inTransaction was false, since the txn
 * path already ends the session on commit/abort).
 */
async function endSession(session) {
  if (session && !session.inTransaction()) {
    session.endSession();
  }
}

module.exports = mongoose => ({
  beginTransaction: () => beginTransaction(mongoose),
  runInTxn: (fn) => runInTxn(mongoose, fn),
  commitTransaction: (session) => commitTransaction(session),
  abortAndEnd: (session) => abortAndEnd(session),
  endSession: (session) => endSession(session),
  supportsTransactions: () => txnSupported,
});