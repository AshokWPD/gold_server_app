const express = require('express');
const router = express.Router();
const controller = require('../controllers/risk-assessment');
const { protect } = require('../middlewares/auth');

router.get('/:groupId', protect, controller.getAllAssessmentItems);

module.exports = router;
