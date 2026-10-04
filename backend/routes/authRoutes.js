const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Todo = require("../models/Todo");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'todo-secret');
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.');
const PASSWORD_REQUIREMENTS_MESSAGE = 'Password must be at least 8 characters and include at least one uppercase letter and one special character.';

function isStrongPassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Z]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

let transporterPromise;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  if (process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS) {
    console.log('Using SMTP transport from .env');
    transporterPromise = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: process.env.MAIL_SECURE === "true",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS.replace(/\s+/g, '')
      }
    });

    // Verify production SMTP before accepting requests that promise email delivery.
    try {
      await transporterPromise.verify();
      console.log('SMTP transport verified successfully');
    } catch (verifyErr) {
      if (process.env.NODE_ENV === 'production') {
        transporterPromise = null;
        const diagnostic = verifyErr.code || (verifyErr.responseCode ? `SMTP ${verifyErr.responseCode}` : 'connection or authentication error');
        console.error('SMTP verification failed:', {
          code: verifyErr.code || null,
          responseCode: verifyErr.responseCode || null,
          command: verifyErr.command || null
        });
        throw new Error(`SMTP verification failed (${diagnostic}). Check the MAIL_* settings in your hosting environment.`);
      }

      console.error('SMTP verify failed, falling back to Ethereal test account:', verifyErr && verifyErr.message);
      const testAccount = await nodemailer.createTestAccount();
      console.log('Ethereal email account created (fallback):', testAccount.user);
      transporterPromise = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log('Using Ethereal SMTP transport for email delivery');
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MAIL_HOST, MAIL_USER, and MAIL_PASS must be set in production.');
    }

    const testAccount = await nodemailer.createTestAccount();
    console.log("Ethereal email account created:", testAccount.user);
    console.log('Using Ethereal test account for email delivery');

    transporterPromise = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  }

  return transporterPromise;
}

function getMailFrom() {
  return process.env.MAIL_FROM || process.env.RESEND_FROM || '"Todo App" <no-reply@todo-app.local>';
}

async function sendResetEmail(mailOptions) {
  const hasSmtpSettings = Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
  if (hasSmtpSettings) {
    const transporter = await getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent via SMTP:', info && info.messageId);
    return { previewUrl: nodemailer.getTestMessageUrl(info) };
  }

  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || (process.env.NODE_ENV !== 'production' ? process.env.MAIL_FROM : '');
    if (!from) {
      throw new Error('Set RESEND_FROM to a sender address verified with Resend.');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [mailOptions.to],
        subject: mailOptions.subject,
        text: mailOptions.text,
        html: mailOptions.html
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Resend email API failed:', response.status, result.message || 'No provider details');
      throw new Error(`Email provider rejected the request (HTTP ${response.status}). Check RESEND_API_KEY and the verified sender domain.`);
    }

    console.log('Password reset email accepted by Resend:', result.id);
    return { previewUrl: null };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set MAIL_HOST, MAIL_USER, and MAIL_PASS for production SMTP, or configure Resend.');
  }

  const transporter = await getTransporter();
  const info = await transporter.sendMail(mailOptions);
  console.log('Password reset email sent:', info && info.messageId);
  return { previewUrl: nodemailer.getTestMessageUrl(info) };
}

function createResetLink(token) {
  const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
  if (!appUrl) {
    throw new Error('Set APP_URL to the public website URL before sending reset links in production.');
  }

  const resetUrl = new URL('/reset-password.html', appUrl);
  if (process.env.NODE_ENV === 'production') {
    if (resetUrl.protocol !== 'https:') {
      throw new Error('APP_URL must use HTTPS in production.');
    }
    if (['localhost', '127.0.0.1', '::1'].includes(resetUrl.hostname)) {
      throw new Error('APP_URL must use the public website hostname in production.');
    }
  }
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
}

// ---------------- SIGNUP ----------------
router.post("/signup", async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    const exist = await User.findOne({ username });

    if (exist) {
      return res.json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      username,
      password: hashedPassword
    });

    await user.save();

    res.json({ success: true, message: "Signup successful" });

  } catch (err) {
    res.json({ success: false, message: "Error in signup" });
  }
});


// ---------------- LOGIN ----------------
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        username: user.username
      }
    });

  } catch (err) {
    res.json({ success: false, message: "Error in login" });
  }
});


// ---------------- FORGOT PASSWORD ----------------
router.put('/change-password', async (req, res) => {
  try {
    const authorization = req.get('authorization') || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Please log in again.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string') {
      return res.status(400).json({ success: false, message: 'Enter your current password.' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ success: false, message: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    const currentPasswordMatches = await bcrypt.compare(currentPassword, user.password);
    if (!currentPasswordMatches) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    console.error('Change-password error:', err);
    return res.status(500).json({ success: false, message: 'Unable to update password right now.' });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const authorization = req.get('authorization') || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Please log in again.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).select('username email createdAt');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const joinedOn = user.createdAt || user._id.getTimestamp();
    return res.json({ success: true, profile: { username: user.username, email: user.email, joinedOn } });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    console.error('Profile lookup error:', err);
    return res.status(500).json({ success: false, message: 'Unable to load profile right now.' });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const authorization = req.get('authorization') || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Please log in again.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!username || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a username and valid email address.' });
    }

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const usernameTaken = await User.findOne({ username, _id: { $ne: user._id } });
    if (usernameTaken) return res.status(409).json({ success: false, message: 'That username is already taken.' });

    user.username = username;
    user.email = email;
    await user.save();
    const joinedOn = user.createdAt || user._id.getTimestamp();
    return res.json({ success: true, message: 'Profile updated.', profile: { username, email, joinedOn } });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'That username is already taken.' });
    console.error('Profile update error:', err);
    return res.status(500).json({ success: false, message: 'Unable to update profile right now.' });
  }
});

router.delete('/account', async (req, res) => {
  try {
    const authorization = req.get('authorization') || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Please log in again.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const { currentPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ success: false, message: 'Enter your password to confirm deletion.' });
    }

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const passwordMatches = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatches) {
      return res.status(400).json({ success: false, message: 'Password is incorrect.' });
    }

    await Todo.deleteMany({ userId: user._id });
    await user.deleteOne();
    return res.json({ success: true, message: 'Account and tasks deleted.' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    console.error('Account deletion error:', err);
    return res.status(500).json({ success: false, message: 'Unable to delete account right now.' });
  }
});

// ---------------- FORGOT PASSWORD ----------------
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const resetLink = createResetLink(token);

    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour

    await user.save();

    const mailOptions = {
      from: getMailFrom(),
      to: email,
      subject: "Todo App Password Reset",
      text: `Click the link to reset your password: ${resetLink}`,
      html: `
        <p>Hi,</p>
        <p>You requested to reset your password. Click the link below to continue:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>This link expires in one hour.</p>
      `
    };

    console.log('Sending password reset email to:', email);
    const { previewUrl } = await sendResetEmail(mailOptions);
    if (previewUrl) {
      console.log("Preview URL:", previewUrl);
    }

    // Return preview URL in development/fallback flows to help debugging
    const responsePayload = {
      success: true,
      message: "Reset link sent to your email"
    };

    if (previewUrl) responsePayload.previewUrl = previewUrl;

    res.json(responsePayload);

  } catch (err) {
    console.error('Forgot-password error:', err);
    res.status(500).json({
      success: false,
      message: "Error sending reset email",
      error: err && err.message
    });
  }
});


// ---------------- RESET PASSWORD ----------------
// Validate token (used by frontend before showing reset form)
router.get('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.json({ success: false, message: 'Invalid or expired token' });
    }

    return res.json({ success: true, message: 'Token valid' });
  } catch (err) {
    console.error('Error validating token', err);
    return res.json({ success: false, message: 'Error validating token' });
  }
});

router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ success: false, message: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.json({ success: false, message: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    await user.save();

    res.json({ success: true, message: "Password reset successful" });

  } catch (err) {
    res.json({ success: false, message: "Error resetting password" });
  }
});

module.exports = router;
