const express = require('express');
const router = express.Router();
const controller = require('../controllers/other-files');
const { protect } = require('../middlewares/auth');

router.get('/', protect, controller.getAllFiles);

module.exports = router;
