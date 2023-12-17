const express = require('express');
const router = express.Router();
const controller = require('../controllers/auth');
const { protect } = require('../middlewares/auth');

router.post('/login', controller.login);
router.post('/register', controller.register);
router.get('/logout', protect, controller.logout);
router.get('/me', protect, controller.getMe);
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password/:token', controller.resetPassword);
router.post('/update-details', protect, controller.updateDetails);
router.post('/update-password', protect, controller.updatePassword);
router.post('/update-avatar', protect, controller.updateAvatar);
router.get('/set-inactive', protect, controller.markAsInactive);

module.exports = router;
