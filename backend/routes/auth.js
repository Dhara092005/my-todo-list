const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

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
        pass: process.env.MAIL_PASS
      }
    });

    // Verify SMTP credentials early and fallback to Ethereal if they fail.
    try {
      await transporterPromise.verify();
      console.log('SMTP transport verified successfully');
    } catch (verifyErr) {
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
  return process.env.MAIL_FROM || '"Todo App" <no-reply@todo-app.local>';
}

// ---------------- SIGNUP ----------------
router.post("/signup", async (req, res) => {
  try {
    const { email, username, password } = req.body;

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

    res.json({
      success: true,
      message: "Login successful",
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
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");

    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour

    await user.save();

    const transporter = await getTransporter();
    const inferredBase = (req && (req.protocol && req.get('host'))) ? `${req.protocol}://${req.get('host')}` : undefined;
    const baseUrl = process.env.APP_URL || inferredBase || "http://localhost:3000";
    const resetLink = `${baseUrl.replace(/\/$/, '')}/reset-password.html?token=${encodeURIComponent(token)}`;
    console.log('Reset link:', resetLink);

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
    const info = await transporter.sendMail(mailOptions);
    console.log("Password reset email sent:", info && info.messageId);

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log("Preview URL:", previewUrl);
    }

    // Return preview URL in development/fallback flows to help debugging
    const responsePayload = {
      success: true,
      message: "Reset link sent to your email"
    };

    if (previewUrl) responsePayload.previewUrl = previewUrl;
    // include the direct reset link for local debugging
    if (process.env.NODE_ENV !== 'production') responsePayload.resetLink = resetLink;

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