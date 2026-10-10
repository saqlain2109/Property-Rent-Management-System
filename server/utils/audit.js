const AuditLog = require('../models/AuditLog');

const logAudit = async ({ userId, action, entityType, entityId, description, previousState, newState, req }) => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '';
    await AuditLog.create({
      userId: userId || (req && req.user ? req.user._id : null),
      action,
      entityType,
      entityId: String(entityId || ''),
      description,
      previousState,
      newState,
      ipAddress
    });
  } catch (err) {
    console.error('[AuditLog Error]', err.message);
  }
};

module.exports = logAudit;
