const fs = require('fs');
const path = require('path');
const mv = require('mv');
const formidable = require('formidable');
const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');
const { generateRandomString } = require('../utils/functions');
const { UserType } = require('@prisma/client');
const sendPushNotification = require('../utils/notification');
const ErrorResponse = require('../utils/errorResponse');

/**
 * @route GET /feedback/drawer-data
 * @desc Get Drawer data for the user
 */
exports.getDrawerData = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const assignedFeedbacks = await prisma.feedbackAssignment.count({
    where: {
      userId,
      assignmentCompleted: false
    }
  });

  res.status(200).json({
    success: true,
    data: {
      assignedFeedbacks
    }
  });
});

/**
 * @route GET /feedback/dashboard
 * @desc Get Feedback Dashboard for the user
 */
exports.getFeedbackDashboard = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const totalFeedbacks = await prisma.feedback.count({
    where: {
      createdById: userId
    }
  });

  const redFeedbacks = await prisma.feedback.count({
    where: {
      createdById: userId,
      color: 'red'
    }
  });

  const yellowFeedbacks = await prisma.feedback.count({
    where: {
      createdById: userId,
      color: 'yellow'
    }
  });

  const greenFeedbacks = await prisma.feedback.count({
    where: {
      createdById: userId,
      color: 'green'
    }
  });

  res.status(200).json({
    success: true,
    data: {
      totalFeedbacks,
      redFeedbacks,
      yellowFeedbacks,
      greenFeedbacks
    }
  });
});

/**
 * @route GET /feedback/assigned
 * @desc Get All Feedbacks Assigned For The User
 */
exports.getAssignedFeedbacks = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const feedbacks = await prisma.feedback.findMany({
    where: {
      feedbackAssignments: {
        some: {
          userId
        }
      }
    },
    include: {
      files: {
        select: {
          id: true,
          fileType: true,
          name: true
        }
      },
      actionFiles: {
        select: {
          id: true,
          fileType: true,
          name: true
        }
      },
      feedbackAssignments: {
        include: {
          user: {
            select: {
              id: true,
              avatar: true,
              name: true,
              email: true
            }
          }
        }
      },
      createdBy: {
        select: {
          id: true,
          avatar: true,
          name: true,
          email: true,
          phone: true
        }
      }
    },
    take: limit,
    skip
  });

  const totalFeedbacks = await prisma.feedback.count({
    where: {
      createdById: userId
    }
  });

  const totalPages = Math.ceil(totalFeedbacks / limit);

  res.status(200).json({
    success: true,
    data: feedbacks,
    totalPages
  });
});

/**
 * @route PUT /feedback/complete/:id
 * @desc Let a user complete the feedback assigned to them
 */
exports.completeAssign = catchAsync(async (req, res, next) => {
  const feedbackId = parseInt(req.params.id, 10);
  const user = req.user;
  const userId = req.user.id;
  const randomString = generateRandomString();
  const filesArr = [];
  const uploadFolder = path.join('public', `feedback-data/${randomString}`);

  // Retrieve the feedback
  const feedback = await prisma.feedback.findUnique({
    where: {
      id: feedbackId
    }
  });

  if (!feedback) {
    throw new ErrorResponse('Feedback not found', 404);
  }

  // Retrieve the feedback assignment
  const feedbackAssignment = await prisma.feedbackAssignment.findFirst({
    where: {
      feedbackId: feedbackId,
      userId: userId
    }
  });

  // Check if the feedback assignment exists
  if (!feedbackAssignment) {
    throw new ErrorResponse('Feedback assignment not found', 404);
  }

  // Create folder
  fs.mkdir(uploadFolder, { recursive: true }, err => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    }
  });

  const form = new formidable.IncomingForm({
    multiples: true,
    maxFileSize: 1000 * 1024 * 1024, // 100MB
    uploadDir: uploadFolder
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      fs.rm(uploadFolder, { recursive: true, force: true }, err => {
        if (err) {
          throw new ErrorResponse(err, 500);
        }
      });
    }

    if (files.files != null) {
      files = Array.isArray(files.files) ? files.files : [files.files];
      const types = fields.types.split(',');
      let i = 0;

      for (const file of files) {
        filesArr.push({
          name: `${randomString}/${file.originalFilename}`,
          fileType: types[i]
        });

        try {
          fs.renameSync(
            file.filepath,
            path.join(uploadFolder, file.originalFilename)
          );
        } catch (error) {
          fs.rm(uploadFolder, { recursive: true, force: true }, err => {
            if (err) {
              // Empty
            }
          });

          throw new ErrorResponse('Cannot Upload File', 400);
        }

        i++;
      }
    } else {
      // Delete Empty Folder
      fs.rm(uploadFolder, { recursive: true, force: true }, err => {
        if (err) {
          throw new ErrorResponse(err, 500);
        }
      });
    }

    // Update the assignment completion status
    await prisma.feedback.update({
      where: { id: feedback.id },
      data: {
        actionTaken: fields.actionTaken,
        actionFiles: { create: filesArr }
      }
    });

    await prisma.feedbackAssignment.update({
      where: {
        id: feedbackAssignment.id
      },
      data: {
        assignmentCompleted: true
      }
    });

    // Fetch all admins and their FCM tokens
    const admins = await prisma.user.findMany({
      where: {
        type: UserType.admin
      },
      select: {
        id: true,
        fcmToken: true
      }
    });

    const adminsFcmTokens = admins
      .map(admin => admin.fcmToken)
      .filter(token => !!token);

    // Send push notification to admins
    await sendPushNotification({
      title: `Assignment Completed By ${user.name} On FB${feedback.id} Feedback`,
      body: '',
      tokens: adminsFcmTokens,
      data: {
        route: 'admin-feedback'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Succesfully Completed Assignment'
    });
  });
});

/**
 * @route GET /feedbacks?page=<int>&limit=<int>&filter=<color|all>
 * @desc Get Feedbacks made by the user with filtering
 */
exports.getFeedbacks = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const filter = req.query.filter || 'all';

  let whereClause = {
    createdById: userId
  };

  if (filter !== 'all') {
    whereClause.color = filter;
  }

  const feedbacks = await prisma.feedback.findMany({
    where: whereClause,
    take: limit,
    skip: offset,
    include: {
      files: {
        select: {
          id: true,
          fileType: true,
          name: true
        }
      },
      actionFiles: {
        select: {
          id: true,
          fileType: true,
          name: true
        }
      },
      feedbackAssignments: {
        include: {
          user: {
            select: {
              id: true,
              avatar: true,
              name: true,
              email: true
            }
          }
        }
      },
      createdBy: {
        select: {
          id: true,
          avatar: true,
          name: true,
          email: true,
          phone: true
        }
      }
    }
  });

  const totalFeedbacks = await prisma.feedback.count({
    where: whereClause
  });

  const totalPages = Math.ceil(totalFeedbacks / limit);

  res.status(200).json({
    success: true,
    data: feedbacks,
    totalPages
  });
});

/**
 * @route PUT /feedback/send-acknowledgement/:id
 * @desc Let a feedback created user send acknowledgement
 */
exports.sendFeedbackAcknowledgement = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { acknowledgement } = req.body;

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    include: { createdBy: true }
  });

  if (!feedback) {
    throw new ErrorResponse('Feedback not found', 404);
  }

  await prisma.feedback.update({
    where: { id },
    data: { userAcknowledgement: acknowledgement }
  });

  // Fetch all admins with non-null FCM tokens
  const admins = await prisma.user.findMany({
    where: { type: UserType.admin, fcmToken: { not: null } },
    select: { id: true, fcmToken: true }
  });

  const adminTokens = admins.map(admin => admin.fcmToken);

  // Send notification to admins
  await sendPushNotification({
    title: `FB${feedback.id} Feedback Issued User Sent An Acknowledgement`,
    body: acknowledgement,
    tokens: adminTokens,
    data: {
      route: 'admin-feedback'
    }
  });

  res.status(200).json({
    success: true,
    message: 'Acknowledgement sent successfully'
  });
});

/**
 * @route POST /feedback
 * @desc Create a feedback
 */
exports.createFeedback = catchAsync(async (req, res, next) => {
  const user = req.user;
  const filesArr = [];
  const randomString = generateRandomString();
  const uploadFolder = path.join('public', `feedback-data/${randomString}`);

  fs.mkdir(uploadFolder, { recursive: true }, err => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    }
  });

  // Move The File From Temp To Feedback Data Dir
  const moveFromTemp = async file => {
    const dest = path.join(__dirname, '../public/feedback-data', filename);

    mv(file.photo.filepath, dest, function (err) {
      if (err) {
        next(err);
      }
    });
  };

  const form = new formidable.IncomingForm({
    multiples: true,
    maxFileSize: 1000 * 1024 * 1024, // 100MB
    uploadDir: uploadFolder
  });

  // Parse form
  form.parse(req, async (err, fields, files) => {
    if (err) {
      fs.rm(uploadFolder, { recursive: true, force: true }, err => {
        if (err) {
          return next(new ErrorResponse(err, 500));
        }
      });
    }

    if (files.files != null) {
      files = Array.isArray(files.files) ? files.files : [files.files];
      const types = fields.types.split(',');
      let i = 0;

      for (const file of files) {
        filesArr.push({
          name: `${randomString}/${file.originalFilename}`,
          fileType: types[i]
        });

        try {
          fs.renameSync(
            file.filepath,
            path.join(uploadFolder, file.originalFilename)
          );
        } catch (error) {
          fs.rm(uploadFolder, { recursive: true, force: true }, err => {
            if (err) {
              // Empty
            }
          });

          return next(new ErrorResponse('Cannot Upload File', 400));
        }

        i++;
      }
    } else {
      // Delete Empty Folder
      fs.rm(uploadFolder, { recursive: true, force: true }, err => {
        if (err) {
          return next(new ErrorResponse(err, 500));
        }
      });
    }

    const location = fields.location;
    const organizationName = fields.organizationName;
    const date = fields.date;
    const time = fields.time;
    const feedback = fields.feedback;
    const source = fields.source;
    const color = fields.color;
    const selectedValues = fields.selectedValues;
    const description = fields.description;
    const reportedBy = fields.reportedBy;

    const data = await prisma.feedback.create({
      data: {
        location,
        organizationName,
        date,
        time,
        feedback,
        source,
        color,
        selectedValues,
        description,
        reportedBy,
        createdById: user.id,
        files: { createMany: { data: filesArr } }
      },
      include: {
        files: {
          select: {
            id: true,
            fileType: true,
            name: true
          }
        },
        actionFiles: {
          select: {
            id: true,
            fileType: true,
            name: true
          }
        },
        feedbackAssignments: {
          include: {
            user: {
              select: {
                id: true,
                avatar: true,
                email: true,
                name: true
              }
            }
          }
        },
        createdBy: {
          select: {
            id: true,
            avatar: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    // Fetch all admins and their FCM tokens
    const admins = await prisma.user.findMany({
      where: {
        type: UserType.admin
      },
      select: {
        id: true,
        fcmToken: true
      }
    });

    const adminsFcmTokens = admins
      .map(admin => admin.fcmToken)
      .filter(token => !!token);

    // Send push notification to admins
    await sendPushNotification({
      title: `Feedback Submitted By ${user.name} On ${organizationName}`,
      body: description,
      tokens: adminsFcmTokens,
      data: {
        route: 'admin-feedback'
      }
    });

    res.status(200).json({
      success: true,
      data
    });
  });
});
