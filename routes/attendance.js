// routes/attendance.js
const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance');

router.post('/', attendanceController.createAttendance);

module.exports = router;
