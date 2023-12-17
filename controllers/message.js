const fs = require('fs');
const path = require('path');
const formidable = require('formidable');
const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');
const { generateRandomString } = require('../utils/functions');
const { generatePdfThumbnail } = require('../utils/functions');
const ErrorResponse = require('../utils/errorResponse');
const sendPushNotification = require('../utils/notification');
const { UserType } = require('@prisma/client');

/**
 * @route GET /message/:groupId?page=<int>&limit=<int>&filter=<string>
 * @desc Return all messages that belong to the group
 */
exports.getMessages = catchAsync(async (req, res) => {
  const groupId = parseInt(req.params.groupId);
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  const skip = (page - 1) * limit;
  const filter = req.query.filter;
  const userId = req.user.id;
  let messages;

  const include = {
    read: true,
    files: true,
    createdBy: true
  };

  if (filter === 'read') {
    messages = await prisma.message.findMany({
      where: {
        groups: {
          some: {
            id: groupId
          }
        },
        read: {
          some: {
            userId: userId
          }
        }
      },
      include,
      skip,
      take: limit
    });
  } else if (filter === 'unread') {
    messages = await prisma.message.findMany({
      where: {
        groups: {
          some: {
            id: groupId
          }
        },
        NOT: {
          read: {
            some: {
              userId: userId
            }
          }
        }
      },
      include,
      skip,
      take: limit
    });
  } else {
    messages = await prisma.message.findMany({
      where: {
        groups: {
          some: {
            id: groupId
          }
        }
      },
      include,
      skip,
      take: limit
    });
  }

  res.status(200).json({
    success: true,
    data: messages
  });
});

/**
 * @route GET /message/detail/:messageId
 * @desc Return all detailed about a message
 */
exports.getMessage = catchAsync(async (req, res) => {
  const messageId = parseInt(req.params.messageId, '10');
  const userId = req.user.id;

  const message = await prisma.message.findUnique({
    where: {
      id: messageId
    },
    include: {
      files: true,
      read: {
        include: {
          user: {
            select: {
              id: true,
              avatar: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          readAt: 'desc'
        },
        take: 1
      },
      createdBy: {
        select: {
          id: true,
          avatar: true,
          name: true
        }
      }
    }
  });

  if (!message) {
    throw new ErrorResponse('Message Not Found', 404);
  }

  const messageReadByUser = message.read.find(read => read.user.id === userId);

  res.status(200).json({
    success: true,
    data: {
      ...message,
      messageReadByUser
    }
  });
});

/**
 * @route POST /message/:groupId
 * @desc Create a new message
 */
exports.createMessage = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const groupId = parseInt(req.params.groupId, '10');
  const filesArr = [];

  const group = await prisma.group.findUnique({
    where: {
      id: groupId
    }
  });

  if (!group) {
    throw new ErrorResponse(
      "Group does not exist (or) You don't have access to this group",
      400
    );
  }

  const randomString = generateRandomString();
  const uploadFolder = path.join('public', `group-data/${randomString}`);

  fs.mkdir(uploadFolder, { recursive: true }, err => {
    if (err) {
      throw new ErrorResponse(err, 500);
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

    const generatePdfThumbnails = filesArr.map(file => {
      if (file.name.endsWith('.pdf')) {
        const filename = file.name.split('/')[1];

        return generatePdfThumbnail({
          pdfPath: path.join(uploadFolder, filename),
          outputDir: path.join(uploadFolder, filename.replace('.pdf', '.jpg'))
        });
      }
    });

    await Promise.all(generatePdfThumbnails);

    const message = await prisma.message.create({
      data: {
        title: fields.title,
        content: fields.content,
        groups: { connect: { id: group.id } },
        timer: parseInt(fields.timer, '10'),
        createdBy: { connect: { id: userId } },
        files: { create: filesArr },
        read:
          // Don't add read for userAndSubAdmin
          req.user.type !== UserType.userAndSubAdmin
            ? {
                create: [
                  {
                    user: { connect: { id: userId } },
                    groupId: group.id
                  }
                ]
              }
            : undefined
      },
      include: {
        files: true,
        createdBy: {
          select: {
            name: true,
            id: true,
            email: true,
            avatar: true
          }
        }
      }
    });

    // Send Notification To Members Of The Group
    const fcmTokenQuery = await prisma.group.findUnique({
      where: {
        id: groupId
      },
      include: {
        members: {
          where: {
            user: {
              fcmToken: {
                not: null
              }
            }
          },
          select: {
            user: {
              select: { fcmToken: true }
            }
          }
        }
      }
    });

    const membersFcmTokens = fcmTokenQuery.members.map(
      member => member.user.fcmToken
    );

    await sendPushNotification({
      title: `New Message On Group: ${group.name}`,
      body: fields.content,
      tokens: membersFcmTokens,
      data: {
        groupIds: JSON.stringify([groupId]),
        route: 'messages'
      }
    });

    // Fetch all admins with non-null FCM tokens
    const admins = await prisma.user.findMany({
      where: { type: UserType.admin, fcmToken: { not: null } },
      select: { id: true, fcmToken: true }
    });

    const adminTokens = admins.map(admin => admin.fcmToken);

    // Send notification to admins
    await sendPushNotification({
      title: `New Message On Group: ${group.name}`,
      body: fields.content,
      tokens: adminTokens,
      data: {
        groupIds: JSON.stringify([groupId]),
        route: 'messages'
      }
    });

    res.status(201).json({
      success: true,
      data: message
    });
  });
});

/**
 * @route PUT /message/:messageId
 * @desc Updates a message
 */
exports.updateMessage = catchAsync(async (req, res, next) => {
  const messageId = parseInt(req.params.messageId, '10');
  const { title, content, timer, files } = req.body;
  const uploadFolder = path.join('public', 'group-data');

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      createdById: req.user.id
    },
    include: {
      files: true
    }
  });

  if (!message) {
    return new ErrorResponse('Message Not Found', 404);
  }

  // Compare old files array with new one to find removed files
  const oldFiles = message.files.map(file => file.name);

  const removedFiles = oldFiles.filter(
    oldFile => !files.some(newFile => newFile.name === oldFile)
  );

  // Delete removed files from server storage
  removedFiles.forEach(async file => {
    try {
      await fs.unlinkSync(path.join(uploadFolder, file));

      if (file.endsWith('.pdf')) {
        const pdfImage = file.replace('.pdf', '.1.jpg');
        fs.unlinkSync(path.join(uploadFolder, pdfImage));
      }
    } catch (error) {
      return new ErrorResponse('Error deleting file ', 500);
    }
  });

  if (!message) {
    return new ErrorResponse('Message not found', 404);
  }

  // Clear all files first
  await prisma.file.deleteMany({ where: { messageId } });

  // Update the message
  await prisma.message.update({
    where: {
      id: messageId
    },
    data: {
      title,
      content,
      timer,
      files: {
        create: files
      }
    }
  });

  res.status(200).json({
    success: true,
    message: 'Message updated successfully'
  });
});

/**
 * @route DELETE /message/:messageId
 * @desc Delete a message
 */
exports.deleteMessage = catchAsync(async (req, res, next) => {
  const user = req.user;
  const messageId = parseInt(req.params.messageId, '10');

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { files: true, createdBy: true }
  });

  const uploadFolder = path.join('public', 'group-data');

  if (!message) {
    return next(new ErrorResponse('Message does not exist', 404));
  }

  if (message.createdBy.id !== user.id) {
    return next(
      new ErrorResponse('You are not authorized to delete this message', 403)
    );
  }

  if (message.files.length > 0) {
    const folderName = message.files[0].name.split('/')[0];
    const folder = path.join(uploadFolder, folderName);

    fs.rm(folder, { recursive: true, force: true }, err => {
      if (err) {
        next(new ErrorResponse('Sorry, Cannot delete message files', 500));
      }
    });
  }

  await prisma.message.delete({
    where: {
      id: messageId
    }
  });

  res.status(200).json({
    success: true,
    message: 'Message deleted successfully'
  });
});

/**
 * @route GET /message/read-status/:id/:groupId
 * @desc Get read status about users who have read & unread
 */
exports.getReadStatus = catchAsync(async (req, res) => {
  const messageId = parseInt(req.params.id, '10');
  const groupId = parseInt(req.params.groupId, '10');
  const userId = req.user.id;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      read: {
        where: {
          NOT: { userId },
          user: { NOT: { type: 'admin' } },
          groupId
        },
        include: { user: true },
        distinct: ['userId'],
        orderBy: { id: 'desc' }
      },
      groups: {
        select: {
          id: true,
          members: {
            where: { NOT: { userId } },
            include: {
              user: true
            }
          }
        }
      }
    }
  });

  if (!message) {
    throw new ErrorResponse('Message Not Found', 404);
  }

  const readUsers = message.read.map(read => ({
    id: read.user.id,
    avatar: read.user.avatar,
    name: read.user.name,
    email: read.user.email,
    mode: read.mode,
    reply: read.reply,
    readAt: read.readAt
  }));

  const group = message.groups.find(group => group.id === groupId);

  if (!group) {
    throw new ErrorResponse('Group Not Found', 404);
  }

  const allUsers = group.members.map(member => ({
    id: member.user.id,
    name: member.user.name,
    avatar: member.user.avatar,
    email: member.user.email
  }));

  const unreadUsers = allUsers.filter(
    user => !readUsers.find(readUser => readUser.id === user.id)
  );

  res.status(200).json({
    success: true,
    readUsers,
    unreadUsers
  });
});

/**
 * @route PUT /message/:messageId/read/:groupId
 * @desc Read a message by logged in user
 */
exports.readMessage = catchAsync(async (req, res) => {
  const messageId = parseInt(req.params.messageId, '10');
  const groupId = parseInt(req.params.groupId, '10');
  const userId = req.user.id;
  const { reply, mode } = req.body;

  const message = await prisma.message.findUnique({
    where: {
      id: messageId
    },
    include: {
      read: {
        where: {
          user: { id: userId },
          groupId
        }
      }
    }
  });

  if (!message) {
    throw new ErrorResponse('Message Not Found', 404);
  }

  if (req.user.type == 'subAdmin') {
    if (message.read.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Message already marked as read'
      });
    }
  }

  await prisma.read.create({
    data: {
      messageId: messageId,
      groupId: groupId,
      userId: userId,
      reply,
      mode
    }
  });

  return res.status(200).json({
    success: true,
    message: 'Message marked as read successfully'
  });
});
