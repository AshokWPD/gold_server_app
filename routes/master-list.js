const express = require('express');
const router = express.Router();
const controller = require('../controllers/master-list');
const { authorize } = require('../middlewares/auth');

const adminsOnly = authorize('admin', 'subAdmin', 'userAndSubAdmin');
router.get('/', adminsOnly, controller.getMasterList);

module.exports = router;




