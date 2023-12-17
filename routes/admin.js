const express = require('express');
const router = express.Router();
const controller = require('../controllers/admin');
const { authorize } = require('../middlewares/auth');

// Admin Auth
router.post('/login', controller.login);
router.use(authorize('admin'));

// Users
router.get('/users', controller.getUsers);
router.post('/users', controller.createUser);
router.put('/users/make-subadmins', controller.makeUsersAsSubAdmins);
router.put('/users/:id', controller.updateUser);
router.delete('/users', controller.deleteUsers);

// SubAdmins
router.get('/subadmins', controller.getSubAdmins);
router.put('/subadmins/make-users', controller.makeSubAdminsAsUsers);

// UserAndSubAdmins
router.get('/user-subadmins', controller.getUserSubAdmins);
router.put('/user-subadmins/make', controller.convertToUserSubAdmins);

// Dashboard
router.get('/dashboard', controller.getDashboardData);

// Login Requests
router.get('/pending-requests', controller.getPendingRequests);
router.put('/update-admin-approved/:id', controller.updateAdminApproved);

// Groups
router.get('/groups', controller.getGroups);
router.post('/groups', controller.createGroup);
router.get('/group/search', controller.searchGroups);
router.put('/groups/:id', controller.updateGroup);
router.delete('/groups', controller.deleteGroup);
router.get('/groups/:id', controller.getGroup);
router.put('/group/:id/make-subadmins', controller.makeMembersSubAdmins);
router.put('/group/:id/make-members', controller.makeSubAdminsMembers);
router.put('/group/:id/members', controller.addGroupMembers);
router.delete('/group/:id/members', controller.removeGroupMembers);
router.get('/group/:id/search-users', controller.searchUsersNotInGroup);

// Messages
router.get('/message/:groupId', controller.getMessagesOfGroup);
router.get('/message/detail/:messageId', controller.getMessage);
router.get('/message/changes/:messageId', controller.getMessageChanges);
router.post('/message/', controller.createMessage);
router.put('/message/:messageId', controller.updateMessage);
router.delete('/message/:messageId', controller.deleteMessage);
router.get('/message/read-status/:id/:groupId', controller.getReadStatus);

// Risk Assessment
router.post('/risk-assessment', controller.createRiskAssessment);
router.put('/risk-assessment/:id', controller.updateRiskAssessment);
router.delete('/risk-assessment/:id', controller.deleteRiskAssessment);

// Other Files
router.post('/other-file', controller.uploadOtherFile);
router.put('/other-file/:id', controller.updateOtherFile);
router.delete('/other-file/:id', controller.deleteOtherFile);

// User Orientation
router.get('/user-orientation/:id', controller.getUserOrientationInfo);
router.post('/user-orientation', controller.uploadUserOrienationItem);
router.put('/user-orientation/:id', controller.updateUserOrientationItem);
router.delete('/user-orientation/:id', controller.deleteUserOrientationItem);

// Feedback
router.get('/feedback', controller.getFeedbacks);
router.get('/feedback/search/users', controller.searchUsersToAssign);
router.put('/feedback/:id/assign-users', controller.assignFeedbackUsers);
router.get('/feedback/dashboard', controller.getFeedbackDashboard);
router.put('/feedback/:id', controller.updateFeedback);
router.delete('/feedback', controller.deleteFeedbacks);



router.get('/print', controller.getMeetingInfo);

module.exports = router;
