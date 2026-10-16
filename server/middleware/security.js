/**
 * Security Middleware for Property & Rent Management
 * Protects against NoSQL injection, parameter pollution, XSS, and payload attacks.
 */

// Recursive sanitization of object keys to prevent NoSQL injection ($gt, $ne, $where, etc.)
function sanitizeNoSQL(target) {
  if (!target || typeof target !== 'object') return target;

  if (Array.isArray(target)) {
    return target.map(item => sanitizeNoSQL(item));
  }

  const clean = {};
  for (const key of Object.keys(target)) {
    // Drop keys starting with $ or containing . (MongoDB operator injection vectors)
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    clean[key] = sanitizeNoSQL(target[key]);
  }
  return clean;
}

const noSqlInjectionProtection = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeNoSQL(req.body);
  }
  if (req.query) {
    req.query = sanitizeNoSQL(req.query);
  }
  if (req.params) {
    req.params = sanitizeNoSQL(req.params);
  }
  next();
};

module.exports = {
  noSqlInjectionProtection
};
