const express = require('express');
const router = express.Router();
const controller = require('../controllers/group');
const { protect, authorize } = require('../middlewares/auth');

const adminsOnly = authorize('admin', 'subAdmin', 'userAndSubAdmin');
router.get('/', protect, controller.getAllGroups);
router.get('/:id', protect, controller.getGroup);
router.get('/:id/members', protect, controller.getGroupMembers);
router.get('/:id/search-users', adminsOnly, controller.searchUsersToAdd);
router.put('/:id/members', adminsOnly, controller.addGroupMember);
router.delete('/:id/members', adminsOnly, controller.removeGroupMember);

module.exports = router;
