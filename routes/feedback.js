const express = require('express');
const router = express.Router();
const controller = require('../controllers/feedback');
const { protect } = require('../middlewares/auth');

router.use(protect);
router.get('/dashboard', controller.getFeedbackDashboard);
router.get('/drawer-data', controller.getDrawerData);
router.get('/assigned', controller.getAssignedFeedbacks);
router.put('/complete/:id', controller.completeAssign);
router.put('/send-acknowledgement/:id', controller.sendFeedbackAcknowledgement);
router.get('/', controller.getFeedbacks);
router.post('/', controller.createFeedback);

module.exports = router;
