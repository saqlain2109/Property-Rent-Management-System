const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const logAudit = require('../utils/audit');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_property_rent_2026_xyz!@#';

const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// @route POST /api/auth/setup-admin
// Initialize first admin if no users exist
router.post('/setup-admin', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'System is already initialized. Please login with existing administrator credentials.'
      });
    }

    const { name, username, email, password } = req.body;
    const user = await User.create({
      name,
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'admin'
    });

    await logAudit({
      userId: user._id,
      action: 'SETUP_ADMIN',
      entityType: 'User',
      entityId: user._id,
      description: `First administrator ${username} (${email}) created`,
      req
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        twoFactorEnabled: false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/auth/login
// Supports login with Username OR Email
router.post('/login', async (req, res) => {
  const identifier = (req.body.username || req.body.email || '').trim().toLowerCase();
  const password = req.body.password;

  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Username is required' });
  }
  if (!password) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  try {
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier }
      ]
    }).select('+password +twoFactorSecret');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Check if Two-Factor Authentication is enabled
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { id: user._id, type: '2fa_pending' },
        JWT_SECRET,
        { expiresIn: '10m' }
      );

      return res.json({
        success: true,
        require2FA: true,
        tempToken,
        username: user.username || user.email,
        message: 'Enter 6-digit verification code from your authenticator app'
      });
    }

    // 2FA not enabled: Log in directly
    user.lastLogin = new Date();
    await user.save();

    await logAudit({
      userId: user._id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user._id,
      description: `User ${user.username || user.email} logged in`,
      req
    });

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        twoFactorEnabled: false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/auth/verify-2fa-login
// Validates TOTP 6-digit code during login
router.post('/verify-2fa-login', [
  body('tempToken').notEmpty().withMessage('Session token is required'),
  body('token').trim().isLength({ min: 6, max: 6 }).withMessage('6-digit verification code is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { tempToken, token: code } = req.body;

  try {
    const decoded = jwt.verify(tempToken, JWT_SECRET);
    if (decoded.type !== '2fa_pending') {
      return res.status(401).json({ success: false, message: 'Invalid authentication session' });
    }

    const user = await User.findById(decoded.id).select('+twoFactorSecret');
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: '2FA is not configured for this account' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.trim(),
      window: 2 // Allow +/- 60 seconds clock drift
    });

    if (!verified) {
      return res.status(400).json({ success: false, message: 'Invalid or expired 6-digit code. Please try again.' });
    }

    user.lastLogin = new Date();
    await user.save();

    await logAudit({
      userId: user._id,
      action: 'LOGIN_2FA',
      entityType: 'User',
      entityId: user._id,
      description: `User ${user.username || user.email} logged in with 2FA`,
      req
    });

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        twoFactorEnabled: true
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
  }
});

// @route GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({
    success: true,
    user: {
      _id: req.user._id,
      name: req.user.name,
      username: req.user.username,
      email: req.user.email,
      phone: req.user.phone || '',
      role: req.user.role,
      twoFactorEnabled: !!req.user.twoFactorEnabled
    }
  });
});

// @route PUT /api/auth/profile
// Update user profile details
router.put('/profile', protect, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, username, email, phone } = req.body;
    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email.toLowerCase().trim();

    // Check if username taken by another user
    const existingUsername = await User.findOne({
      username: cleanUsername,
      _id: { $ne: req.user._id }
    });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: 'Username is already taken by another user' });
    }

    // Check if email taken by another user
    const existingEmail = await User.findOne({
      email: cleanEmail,
      _id: { $ne: req.user._id }
    });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email is already registered by another user' });
    }

    const user = await User.findById(req.user._id);
    user.name = name.trim();
    user.username = cleanUsername;
    user.email = cleanEmail;
    user.phone = phone ? phone.trim() : '';

    await user.save();

    await logAudit({
      userId: user._id,
      action: 'UPDATE_PROFILE',
      entityType: 'User',
      entityId: user._id,
      description: `Updated profile details for ${cleanUsername}`,
      req
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        twoFactorEnabled: !!user.twoFactorEnabled
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route PUT /api/auth/change-password
// Change user password with current password verification
router.put('/change-password', protect, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    await logAudit({
      userId: user._id,
      action: 'CHANGE_PASSWORD',
      entityType: 'User',
      entityId: user._id,
      description: `Password changed successfully`,
      req
    });

    res.json({ success: true, message: 'Password changed successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/auth/2fa/generate
// Generates TOTP secret and QR code for scanning in Google Authenticator / Microsoft Authenticator
router.post('/2fa/generate', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const identifier = user.username || user.email;

    const secret = speakeasy.generateSecret({
      name: `PropertyRent (${identifier})`,
      issuer: 'Property & Rent Management',
      length: 20
    });

    user.twoFactorTempSecret = secret.base32;
    await user.save();

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      success: true,
      qrCode: qrCodeDataUrl,
      secret: secret.base32,
      account: identifier,
      issuer: 'Property & Rent Management'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/auth/2fa/enable
// Verifies 6-digit TOTP code and activates 2FA
router.post('/2fa/enable', protect, [
  body('token').trim().isLength({ min: 6, max: 6 }).withMessage('6-digit code is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const user = await User.findById(req.user._id).select('+twoFactorTempSecret');
    if (!user.twoFactorTempSecret) {
      return res.status(400).json({
        success: false,
        message: 'Please initiate 2FA setup first by generating a QR code.'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorTempSecret,
      encoding: 'base32',
      token: req.body.token.trim(),
      window: 2
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please check your authenticator app time and try again.'
      });
    }

    user.twoFactorEnabled = true;
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
    await user.save();

    await logAudit({
      userId: user._id,
      action: 'ENABLE_2FA',
      entityType: 'User',
      entityId: user._id,
      description: 'Two-Factor Authentication enabled',
      req
    });

    res.json({
      success: true,
      message: 'Two-factor authentication has been enabled successfully!'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route POST /api/auth/2fa/disable
// Disables 2FA after password confirmation
router.post('/2fa/disable', protect, [
  body('password').notEmpty().withMessage('Password is required to disable 2FA')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const user = await User.findById(req.user._id).select('+password +twoFactorSecret');
    const isMatch = await user.matchPassword(req.body.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect password. 2FA not disabled.' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorTempSecret = undefined;
    await user.save();

    await logAudit({
      userId: user._id,
      action: 'DISABLE_2FA',
      entityType: 'User',
      entityId: user._id,
      description: 'Two-Factor Authentication disabled',
      req
    });

    res.json({
      success: true,
      message: 'Two-factor authentication has been disabled.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route GET /api/auth/status
// Checks if admin setup is needed
router.get('/status', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({
      success: true,
      isInitialized: userCount > 0,
      userCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error checking auth status'
    });
  }
});

module.exports = router;
