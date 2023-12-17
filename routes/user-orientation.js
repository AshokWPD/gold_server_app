const express = require('express');
const router = express.Router();
const controller = require('../controllers/user-orientation');
const { protect } = require('../middlewares/auth');

router.get('/', protect, controller.getAllUserOrientationItems);
router.post('/:id', protect, controller.readUserOrientationItem);

module.exports = router;
