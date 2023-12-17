const nodemailer = require('nodemailer');
const { htmlToText } = require('html-to-text');

module.exports = class Email {
  constructor(user) {
    this.from = process.env.EMAIL_FROM;
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
  }

  newTransport() {
    if (process.env.NODE_ENV === 'production') {
      return nodemailer.createTransport({
        host: 'mail.goltens.a2hosted.com',
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_PROD,
          pass: process.env.EMAIL_PROD_PASS
        }
      });
    }

    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  // Send the actual email
  async send(html, subject) {
    return await this.newTransport().sendMail({
      from: this.from,
      to: this.to,
      subject,
      html
    });
  }

  async sendPasswordReset(token) {
    const text = `
    <h1>Hello ${this.firstName}</h1><br />
    <h1>Password Reset (Goltens Communication)</h1><br />
    <p>Your token: ${token}</p>
    `;

    return await this.send(
      htmlToText(text),
      'Your password reset token (valid for only 10 minutes)'
    );
  }
};
