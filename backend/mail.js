const nodemailer = require('nodemailer');

let transporterPromise;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  if (process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS) {
    transporterPromise = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    try {
      await transporterPromise.verify();
      console.log('SMTP transporter verified');
    } catch (err) {
      console.error('SMTP verify failed, falling back to Ethereal:', err && err.message);
      const testAccount = await nodemailer.createTestAccount();
      transporterPromise = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log('Using Ethereal account:', testAccount.user);
    }
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporterPromise = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log('Using Ethereal account:', testAccount.user);
  }

  return transporterPromise;
}

function getMailFrom() {
  return process.env.MAIL_FROM || '"Todo App" <no-reply@todo-app.local>';
}

async function sendMail({ to, subject, text, html }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({ from: getMailFrom(), to, subject, text, html });
  const preview = nodemailer.getTestMessageUrl(info);
  return { info, preview };
}

module.exports = { getTransporter, sendMail, getMailFrom };
