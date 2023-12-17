const admin = require('firebase-admin');
const fcm = require('fcm-notification');
const serviceAccount = require('../config/goltens-app-firebase-admin.json');
const certPath = admin.credential.cert(serviceAccount);
const FCM = new fcm(certPath);

module.exports = ({ title, body, tokens, data }) => {
  return new Promise((resolve, reject) => {
    const message = {
      notification: { title, body },
      data
    };

    FCM.sendToMultipleToken(message, tokens, (err, response) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
};
