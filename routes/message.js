const express = require('express');
const router = express.Router();
const controller = require('../controllers/message');
const { protect, authorize } = require('../middlewares/auth');

const adminsOnly = authorize('admin', 'subAdmin', 'userAndSubAdmin');
router.get('/:groupId', protect, controller.getMessages);
router.get('/detail/:messageId', protect, controller.getMessage);
router.post('/:groupId', adminsOnly, controller.createMessage);
router.put('/:messageId', adminsOnly, controller.updateMessage);
router.delete('/:messageId', adminsOnly, controller.deleteMessage);
router.get('/read-status/:id/:groupId', adminsOnly, controller.getReadStatus);
router.put('/:messageId/read/:groupId', protect, controller.readMessage);

module.exports = router;
