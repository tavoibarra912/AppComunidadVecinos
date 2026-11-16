// Definiciones DDL de todos los módulos (tablas e índices) centralizadas:
// se ejecutan al importar src/db.js para que existan siempre, incluso en
// scripts o tests que cargan un único módulo de la aplicación.
export const DDL_APP = `CREATE TABLE IF NOT EXISTS access_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, createdAt TEXT NOT NULL,
    actorId TEXT NOT NULL, actorName TEXT NOT NULL, action TEXT NOT NULL,
    resourceType TEXT NOT NULL, resourceId TEXT NOT NULL, outcome TEXT NOT NULL,
    method TEXT NOT NULL, route TEXT NOT NULL, ip TEXT NOT NULL, details TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS access_audit_action ON access_audit(action, id);

CREATE TABLE IF NOT EXISTS communication_posts (
 id TEXT PRIMARY KEY, communityId TEXT NOT NULL, data TEXT NOT NULL,
 createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_communication_community ON communication_posts(communityId);
CREATE TABLE IF NOT EXISTS communication_recipients (
 postId TEXT NOT NULL, userId TEXT NOT NULL, readAt TEXT NOT NULL DEFAULT '', receiptAt TEXT NOT NULL DEFAULT '',
 rsvp TEXT NOT NULL DEFAULT 'pending', attended INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(postId,userId)
);
CREATE TABLE IF NOT EXISTS communication_comments (
 id TEXT PRIMARY KEY, postId TEXT NOT NULL, userId TEXT NOT NULL, body TEXT NOT NULL,
 createdAt TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS communication_ballots (
 postId TEXT NOT NULL, userId TEXT NOT NULL, choices TEXT NOT NULL, createdAt TEXT NOT NULL,
 PRIMARY KEY(postId,userId)
);
CREATE TABLE IF NOT EXISTS communication_files (
 id TEXT PRIMARY KEY, postId TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, content BLOB NOT NULL,
 kind TEXT NOT NULL, final INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS communication_audit (
 id TEXT PRIMARY KEY, postId TEXT NOT NULL, userId TEXT NOT NULL, action TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS communication_preferences (userId TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS communication_providers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS communication_outbox (
 id TEXT PRIMARY KEY, postId TEXT NOT NULL, userId TEXT NOT NULL, channel TEXT NOT NULL, kind TEXT NOT NULL,
 version INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '',
 providerId TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 UNIQUE(postId,userId,channel,kind,version)
);

CREATE TABLE IF NOT EXISTS fee_plans (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, effectiveFrom TEXT NOT NULL,
    data TEXT NOT NULL, createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
    UNIQUE(communityId,effectiveFrom)
  );
  CREATE TABLE IF NOT EXISTS fee_receipts (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, propertyId TEXT NOT NULL,
    planId TEXT NOT NULL, period TEXT NOT NULL, periodEnd TEXT NOT NULL,
    dueDate TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
    snapshot TEXT NOT NULL, createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
    cancelledAt TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS fee_receipts_community ON fee_receipts(communityId,period);
  CREATE TABLE IF NOT EXISTS fee_payments (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, ownerId TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount>0), paidOn TEXT NOT NULL, method TEXT NOT NULL,
    reference TEXT NOT NULL, requestId TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL, actorId TEXT NOT NULL, reversedAt TEXT NOT NULL DEFAULT '',
    reversalReason TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS fee_allocations (
    paymentId TEXT NOT NULL, receiptId TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
    PRIMARY KEY(paymentId,receiptId)
  );
  CREATE TABLE IF NOT EXISTS fee_proofs (
    id TEXT PRIMARY KEY, receiptId TEXT NOT NULL, ownerId TEXT NOT NULL,
    fileName TEXT NOT NULL, diskName TEXT NOT NULL, mime TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL, reviewedAt TEXT NOT NULL DEFAULT '', actorId TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fee_events (
    id TEXT PRIMARY KEY, receiptId TEXT NOT NULL, ownerId TEXT NOT NULL,
    kind TEXT NOT NULL, eventKey TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    createdAt TEXT NOT NULL, UNIQUE(receiptId,ownerId,kind,eventKey)
  );
  CREATE TABLE IF NOT EXISTS fee_mail (
    eventId TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'pending',
    error TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS fee_allocations_receipt ON fee_allocations(receiptId);
  CREATE INDEX IF NOT EXISTS fee_proofs_receipt ON fee_proofs(receiptId);
  CREATE INDEX IF NOT EXISTS fee_payments_owner ON fee_payments(communityId,ownerId);
  CREATE TABLE IF NOT EXISTS fee_assessments (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, name TEXT NOT NULL,
    totalAmount INTEGER NOT NULL CHECK(totalAmount>0), data TEXT NOT NULL,
    createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
    cancelledAt TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS fee_assessments_community ON fee_assessments(communityId,createdAt);

CREATE TABLE IF NOT EXISTS password_recovery_requests (emailHash TEXT PRIMARY KEY, requestedAt INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS password_recovery_mail (
    id TEXT PRIMARY KEY, userId TEXT NOT NULL, tokenHash TEXT NOT NULL, payload TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending', createdAt INTEGER NOT NULL
  );

CREATE TABLE IF NOT EXISTS service_bills (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, service TEXT NOT NULL,
    supplier TEXT NOT NULL DEFAULT '', invoiceNumber TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL, issueDate TEXT NOT NULL, dueDate TEXT NOT NULL,
    totalAmount INTEGER NOT NULL CHECK(totalAmount>0), data TEXT NOT NULL,
    createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
    issuedAt TEXT NOT NULL DEFAULT '',
    cancelledAt TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS service_bills_community ON service_bills(communityId,issueDate);
  CREATE TABLE IF NOT EXISTS service_attachments (
    id TEXT PRIMARY KEY, serviceBillId TEXT NOT NULL,
    fileName TEXT NOT NULL, diskName TEXT NOT NULL, mime TEXT NOT NULL,
    createdAt TEXT NOT NULL, actorId TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS service_attachments_bill ON service_attachments(serviceBillId);

CREATE TABLE IF NOT EXISTS contact_verification_challenges (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  destino TEXT NOT NULL,
  codigo TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0
)`;
