// controllers/meeting.js
const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
// const fs = require('fs');
const path = require('path');
// const formidable = require('formidable');
const sharp = require('sharp');


exports.createMeeting = catchAsync(async (req, res, next) => {
  const {
    meetCreater,
    meetDateTime,
    meetTitle,
    meetingTime,
    department,
    createrId,
    membersCount,
    membersList,
    isOnline,
    attId,
    meetEndTime,
    meetingId,
    membersAttended, // Include membersAttended in the request body
  } = req.body;

  try {
    const newMeeting = await prisma.meeting.create({
      data: {
        meetCreater,
        meetDateTime,
        meetTitle,
        meetingTime,
        department,
        createrId,
        membersCount,
        isOnline,
        attId,
        meetEndTime,
        meetingId,
        membersList: {
          create: membersList,
        },
        membersAttended: { // Include membersAttended creation
          create: membersAttended,
        },
      },
      include: {
        membersList: true,
        membersAttended: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Meeting created successfully',
      data: newMeeting,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});



/**
 * @route GET /info
 * @desc Get meeting information
 */
exports.getMeetingInfo = async (req, res, next) => {
  try {
    // Assuming you have a Meeting model
    const meetings = await prisma.meeting.findMany();

    res.status(200).json({
      success: true,
      data: meetings,
      message: 'Meeting information retrieved successfully',
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
};



/**
 * @route GET /meeting/getmeet/:meetingId
 * @desc Get meeting information by meetingId
 */
exports.getMeetingById = catchAsync(async (req, res, next) => {
  // const { meetingId } = req.params;
  const meetingId = parseInt(req.params.meetingId, 10);

  try {
    // Assuming you have a Meeting model
    const meeting = await prisma.meeting.findUnique({
      where: {
        meetingId,
      },
      include: {
        membersList: true,
        membersAttended: true,
      },
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found',
      });
    }

    res.status(200).json({
      success: true,
      data: meeting,
      message: 'Meeting information retrieved successfully',
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});


/**
 * @route PUT /meeting/update/:meetingId
 * @desc Partially update meeting information by meetingId (membersCount and meetEndTime)
 */
exports.partialUpdateMeeting = catchAsync(async (req, res, next) => {
  // const { meetingId } = req.params;
  const meetingId = parseInt(req.params.meetingId, 10);

  const { membersCount, meetEndTime ,attId} = req.body;

  try {
    // Assuming you have a Meeting model
    const updatedMeeting = await prisma.meeting.update({
      where: {
        meetingId,
      },
      data: {
        membersCount,
        meetEndTime,
        attId
      },
    });

    res.status(200).json({
      success: true,
      message: 'Meeting partially updated successfully',
      data: updatedMeeting,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});






/**
 * @route POST /meeting/getMeetingsByCreaterId
 * @desc Get meetings by createrId
 */
exports.getMeetingsByCreaterId = catchAsync(async (req, res, next) => {
  const { createrId } = req.body;

  try {
    // Check if createrId is provided
    if (!createrId) {
      return res.status(400).json({
        success: false,
        message: 'createrId is required for this operation',
      });
    }

    // Retrieve meetings for the specified createrId
    const meetings = await prisma.meeting.findMany({
      where: {
        createrId,
      },
      include: {
        membersList: true,
        membersAttended: true,
      },
    });

    res.status(200).json({
      success: true,
      data: meetings,
      message: 'Meetings retrieved successfully for createrId',
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});


/**
 * @route POST /meeting/getMeetingsByMemberId
 * @desc Get meetings by memberId in membersAttended list
 */
exports.getMeetingsByMemberId = catchAsync(async (req, res, next) => {
  const { memberId } = req.body;

  try {
    // Check if memberId is provided
    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: 'memberId is required for this operation',
      });
    }

    // Assuming you have a MembersAttended model
    const meetings = await prisma.meeting.findMany({
      where: {
        membersAttended: {
          some: {
            memberId,
          },
        },
      },
      include: {
        membersList: true,
        membersAttended: true,
      },
    });

    res.status(200).json({
      success: true,
      data: meetings,
      message: 'Meetings retrieved successfully for memberId',
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});


// Function to handle base64-encoded signature and store the image
const storeDigitalSignature = async (base64Signature) => {
  const meetsignDir = path.join(__dirname, '../public/digitalsign');
  
  // Decode base64 digital signature
  const signatureBuffer = Buffer.from(base64Signature, 'base64');
  
  // Generate a unique file name
  const signatureFileName = `signature_${Date.now()}.png`;
  
  // Create the path for the stored image
  const signatureFilePath = path.join(meetsignDir, signatureFileName);

  // Use sharp to resize and save the image (adjust the options as needed)
  await sharp(signatureBuffer)
    .resize({ width: 300, height: 200 })
    .toFile(signatureFilePath);

  // Return the URL of the stored image
  const signatureFileUrl = `http://localhost:3000/api/v1/digitalsign/${signatureFileName}`;
  return signatureFileUrl;
};

exports.addMemberToAttendedList = catchAsync(async (req, res, next) => {
  const meetingId = parseInt(req.params.meetingId, 10); // Parse meetingId as integer
  const {
    membersName,
    memberInTime,
    memberOutTime,
    memberId,
    dateTime,
    latitude,
    longitude,
    digitalSignature,
  } = req.body;

  try {
    // Store the digital signature and get the URL
    const signatureFileUrl = await storeDigitalSignature(digitalSignature);

    // Update the meeting by adding a new member to the MembersAttended array
    const updatedMeeting = await prisma.meeting.update({
      where: {
        meetingId,
      },
      data: {
        membersAttended: {
          create: {
            membersName,
            memberInTime,
            memberOutTime,
            memberId,
            dateTime,
            latitude,
            longitude,
            digitalSignatureFile: {
              create: {
                name: path.basename(signatureFileUrl),
                fileType: 'image/png', // Adjust based on the actual format
                path: signatureFileUrl,
              },
            },
          },
        },
      },
      include: {
        membersAttended: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Member added to MembersAttended list successfully',
      data: updatedMeeting.membersAttended,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});


exports.updateMemberInAttendedList = catchAsync(async (req, res, next) => {
  const meetingId = parseInt(req.params.meetingId, 10);
  const memberId = parseInt(req.params.memberId, 10);
  const {
    membersName,
    memberInTime,
    memberOutTime,
    dateTime,
    latitude,
    longitude,
    digitalSignature,
  } = req.body;

  try {
    const existingMember = await prisma.membersAttended.findFirst({
      where: {
        meetingId,
        memberId,
      },
      include: {
        digitalSignatureFile: true,
      },
    });

    if (!existingMember) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in the MembersAttended list',
      });
    }

    let updatedSignatureFileUrl;
    if (digitalSignature) {
      updatedSignatureFileUrl = await storeDigitalSignature(digitalSignature);

      if (existingMember.digitalSignatureFile) {
        await prisma.digitalSignatureFile.update({
          where: {
            fileId: existingMember.digitalSignatureFile.fileId,
          },
          data: {
            name: path.basename(updatedSignatureFileUrl),
            path: updatedSignatureFileUrl,
          },
        });
      }
    }

    const updatedMember = await prisma.membersAttended.update({
      where: {
        id: existingMember.id, // Add id to the where clause
      },
      data: {
        membersName,
        memberInTime,
        memberOutTime,
        dateTime,
        latitude,
        longitude,
        digitalSignatureFile: updatedSignatureFileUrl
          ? {
              update: {
                name: path.basename(updatedSignatureFileUrl),
                path: updatedSignatureFileUrl,
              },
            }
          : undefined,
      },
      include: {
        digitalSignatureFile: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Member details in MembersAttended list updated successfully',
      data: updatedMember,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});



// model MembersList {
//   id        Int      @id @default(autoincrement())
//   meetingId String
//   membersname   String
//   meeting   Meeting @relation(fields: [meetingId], references: [meetingId])
// }

// model MembersAttended {
//   id        Int      @id @default(autoincrement())
//   meetingId String
//   membersName   String
//   memberInTime  String
//   memberOutTime String
//   meeting   Meeting @relation(fields: [meetingId], references: [meetingId])
// }




// /**
//  * @route POST /meeting/update/:meetingId
//  * @desc Update meeting information by meetingId
//  */
// exports.updateMeetingById = catchAsync(async (req, res, next) => {
//   const { meetingId } = req.params;
//   const {
//     meetCreater,
//     meetDateTime,
//     meetTitle,
//     meetingTime,
//     department,
//     createrId,
//     membersCount,
//     membersList,
//     membersAttended,
//     isOnline,
//     attId,
//     meetEndTime,
//   } = req.body;

//   try {
//     // Assuming you have a Meeting model
//     const updatedMeeting = await prisma.meeting.update({
//       where: {
//         meetingId,
//       },
//       data: {
//         meetCreater,
//         meetDateTime,
//         meetTitle,
//         meetingTime,
//         department,
//         createrId,
//         membersCount,
//         isOnline,
//         attId,
//         meetEndTime,
//         // Assuming you have associations with MembersList and MembersAttended
//         membersList: {
//           upsert: membersList.map((member) => ({
//             where: { id: member.id }, // Update existing members
//             update: member,
//             create: member, // Create new members if not existing
//           })),
//         },
//         membersAttended: {
//           upsert: membersAttended.map((attended) => ({
//             where: { id: attended.id }, // Update existing membersAttended
//             update: attended,
//             create: attended, // Create new membersAttended if not existing
//           })),
//         },
//       },
//       include: {
//         membersList: true,
//         membersAttended: true,
//       },
//     });

//     res.status(200).json({
//       success: true,
//       message: 'Meeting updated successfully',
//       data: updatedMeeting,
//     });
//   } catch (error) {
//     console.error(error);
//     next(error);
//   }
// });






// /**
//  * @route POST /meeting/add-member/:meetingId
//  * @desc Add a member to the MembersAttended list by meetingId
//  */
// exports.addMemberToAttendedList = catchAsync(async (req, res, next) => {
//   const { meetingId } = req.params;
//   const { membersName, memberInTime, memberOutTime,memberId , dateTime,latitude,longitude} = req.body;

//   try {
//     // Assuming you have a Meeting model
//     const updatedMeeting = await prisma.meeting.update({
//       where: {
//         meetingId,
//       },
//       data: {
//         membersAttended: {
//           create: {
//             membersName,
//             memberInTime,
//             memberOutTime,
//             memberId,
//             dateTime,
//             latitude,
//             longitude
//           },
//         },
//       },
//       include: {
//         membersAttended: true,
//       },
//     });

//     res.status(200).json({
//       success: true,
//       message: 'Member added to MembersAttended list successfully',
//       data: updatedMeeting.membersAttended,
//     });
//   } catch (error) {
//     console.error(error);
//     next(error);
//   }
// });










// exports.addMemberToAttendedList = catchAsync(async (req, res, next) => {
//   const { meetingId } = req.params;
//   const {
//     membersName,
//     memberInTime,
//     memberOutTime,
//     memberId,
//     dateTime,
//     latitude,
//     longitude,
//   } = req.body;

//   try {
//     const form = new formidable.IncomingForm();
//     form.parse(req, async (err, fields, files) => {
//       if (err) {
//         return next(err);
//       }

//       const meetsignDir = path.join(__dirname, '../public/meetsign');
//       const { name, type } = files.digitalSignature;

//       // Move the uploaded file to the "public/meetsign" directory
//       const filePath = path.join(meetsignDir, name);
//       fs.renameSync(files.digitalSignature.path, filePath);

//       // Assuming you have a Meeting model
//       const updatedMeeting = await prisma.meeting.update({
//         where: {
//           meetingId,
//         },
//         data: {
//           membersAttended: {
//             create: {
//               membersName,
//               memberInTime,
//               memberOutTime,
//               memberId,
//               dateTime,
//               latitude,
//               longitude,
//               digitalSignatureFile: {
//                 create: {
//                   name,
//                   fileType: type,
//                   path: filePath, // Store the file path in the database
//                 },
//               },
//             },
//           },
//         },
//         include: {
//           membersAttended: {
//             include: {
//               digitalSignatureFile: true,
//             },
//           },
//         },
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Member added to MembersAttended list successfully',
//         data: updatedMeeting.membersAttended,
//       });
//     });
//   } catch (error) {
//     console.error(error);
//     next(error);
//   }
// });