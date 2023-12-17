const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meeting');

// Create a meeting
router.post('/meet', meetingController.createMeeting);

// Get all meetings
router.get('/meetings', meetingController.getMeetingInfo); // Change from '/getmeet' to '/meetings'

// Get a specific meeting by meetingId
router.get('/meet/:meetingId', meetingController.getMeetingById);

// Update a meeting by meetingId
router.put('/meet/:meetingId', meetingController.partialUpdateMeeting);

// Get meetings created by a specific user
router.post('/meetings/creater', meetingController.getMeetingsByCreaterId); // Change from '/getMeetingsByCreaterId'

// Get meetings attended by a specific member
router.post('/meetings/member', meetingController.getMeetingsByMemberId); // Change from '/getMeetingsByMemberId'

// Add a member to the attended list for a meeting
router.post('/addmember/:meetingId', meetingController.addMemberToAttendedList); // Change from '/addMember/:meetingId'


// Update membersAttended list for a meeting
router.put('/meet/:meetingId/member/:memberId', meetingController.updateMemberInAttendedList);

module.exports = router;


// // routes/meeting.js
// const express = require('express');
// const router = express.Router();
// const meetingController = require('../controllers/meeting');

// // Create a meeting
// router.post('/meet', meetingController.createMeeting);

// // Get all meetings
// router.get('/getmeet', meetingController.getMeetingInfo);

// // Get a specific meeting by meetingId
// router.get('/getmeet/:meetingId', meetingController.getMeetingById);

// // Update a meeting by meetingId
// router.put('/update/:meetingId', meetingController.partialUpdateMeeting);

// // Add a member to the attended list for a meeting
// router.post('/addMember/:meetingId', meetingController.addMemberToAttendedList);

// // Get meetings created by a specific user
// router.post('/getMeetingsByCreaterId', meetingController.getMeetingsByCreaterId);

// // Get meetings attended by a specific member
// router.post('/getMeetingsByMemberId', meetingController.getMeetingsByMemberId);

// // Update membersAttended list for a meeting
// router.put('/:meetingId/update-member/:memberId', meetingController.updateMemberInAttendedList);

// module.exports = router;

