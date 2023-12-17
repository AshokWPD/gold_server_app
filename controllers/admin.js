const fs = require('fs');
const path = require('path');
const Prisma = require('@prisma/client');
const mv = require('mv');
const formidable = require('formidable');
const catchAsync = require('../utils/catchAsync');
const ErrorResponse = require('../utils/errorResponse');
const prisma = require('../config/prisma');
const authUtils = require('../utils/auth');
const sendPushNotification = require('../utils/notification');
const { generateRandomString } = require('../utils/functions');
const { generatePdfThumbnail } = require('../utils/functions');

/**
 * @route POST /admin/login
 * @desc let the admin login
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password, fcmToken } = req.body;

  // Validate email & password
  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { password: true, id: true, type: true }
  });

  // User Not Found In DB
  if (!user) {
    return next(new ErrorResponse('Invalid Email Or Password', 401));
  }

  // Update FCM Token
  await prisma.user.update({ where: { email }, data: { fcmToken } });

  const isPasswordMatched = await authUtils.matchPassword(
    password,
    user.password
  );

  // Wrong Password
  if (!isPasswordMatched) {
    return next(new ErrorResponse('Invalid Email Or Password', 401));
  }

  // Allow only admins
  if (user.type !== Prisma.UserType.admin) {
    return next(new ErrorResponse('Invalid login type', 401));
  }

  const token = authUtils.getSignedJwtToken(user.id);
  res.status(200).json({ success: true, token });
});

/**
 * @route GET /admin/users?page=<int>&limit=<int>&query=<string>
 * @desc Get all users
 */
exports.getUsers = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skipIndex = (page - 1) * limit;

  const count = await prisma.user.count({
    where: {
      type: 'user',
      OR: [
        { name: { contains: req.query.search } },
        { email: { contains: req.query.search } },
        { phone: { contains: req.query.search } },
        { department: { contains: req.query.search } },
        { employeeNumber: { contains: req.query.search } }
      ]
    }
  });

  const totalPages = Math.ceil(count / limit);

  const users = await prisma.user.findMany({
    where: {
      type: 'user',
      OR: [
        { name: { contains: req.query.search } },
        { email: { contains: req.query.search } },
        { phone: { contains: req.query.search } },
        { department: { contains: req.query.search } },
        { employeeNumber: { contains: req.query.search } }
      ]
    },
    select: {
      id: true,
      avatar: true,
      name: true,
      email: true,
      phone: true,
      department: true,
      employeeNumber: true,
      type: true,
      active: true,
      adminApproved: true,
      createdAt: true
    },
    skip: skipIndex,
    take: limit
  });

  res.status(200).json({
    success: true,
    data: users,
    totalPages
  });
});

/**
 * @route POST /admin/users/
 * @desc Create a user
 */
exports.createUser = catchAsync(async (req, res, next) => {
  const form = formidable();
  const filename = `${generateRandomString()}.jpg`;

  // Move The File From Temp To Avatar Dir
  const moveFromTemp = async file => {
    const dest = path.join(__dirname, '../public/avatar', filename);

    mv(file.avatar.filepath, dest, function (err) {
      if (err) {
        next(err);
      }
    });
  };

  // Parse form
  form.parse(req, async (err, fields, file) => {
    if (err) {
      return next(err);
    }

    const name = fields.name;
    const email = fields.email;
    const password = await authUtils.hashPassword(fields.password);
    const phone = fields.phone;
    const department = fields.department;
    const employeeNumber = fields.employeeNumber;
    let type = Prisma.UserType.user;

    if (fields.type === 'subAdmin') {
      type = Prisma.UserType.subAdmin;
    }

    if (fields.type === 'userAndSubAdmin') {
      type = Prisma.UserType.userAndSubAdmin;
    }

    try {
      if (file.avatar) {
        await moveFromTemp(file);

        await prisma.user.create({
          data: {
            avatar: filename,
            name,
            email,
            password,
            phone,
            department,
            employeeNumber,
            type,
            adminApproved: Prisma.AdminApproved.approved
          }
        });
      } else {
        await prisma.user.create({
          data: {
            avatar: '',
            name,
            email,
            password,
            phone,
            department,
            employeeNumber,
            type,
            adminApproved: Prisma.AdminApproved.approved
          }
        });
      }
      res.status(201).json({
        success: true,
        message: 'User created successfully'
      });
    } catch (err) {
      next(err);
    }
  });
});

/**
 * @route PUT /admin/users/:id
 * @desc Update a user
 */
exports.updateUser = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');
  const form = formidable();
  const filename = `${generateRandomString()}.jpg`;

  // Move The File From Temp To Avatar Dir
  const moveFromTemp = async file => {
    const dest = path.join(__dirname, '../public/avatar', filename);

    mv(file.avatar.filepath, dest, function (err) {
      if (err) {
        next(err);
      }
    });
  };

  // Parse form
  form.parse(req, async (err, fields, file) => {
    if (err) {
      return next(err);
    }

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      throw new ErrorResponse('User not found', 404);
    }

    const name = fields.name;
    const email = fields.email;
    const password = fields.password;
    const phone = fields.phone;
    const department = fields.department;
    const active = fields.active === 'true' ? true : false;
    const employeeNumber = fields.employeeNumber;
    const deleteAvatar = fields.deleteAvatar;

    try {
      if (file.avatar) {
        await moveFromTemp(file);

        await prisma.user.update({
          where: { id },
          data: {
            avatar: filename,
            name,
            email,
            phone,
            department,
            employeeNumber,
            active
          }
        });

        // Delete old avatar
        if (user.avatar.length > 0) {
          try {
            const oldAvatar = path.join(
              __dirname,
              '../public/avatar',
              user.avatar
            );
            fs.unlinkSync(oldAvatar);
          } catch (err) {
            return next(err);
          }
        }
      } else {
        let data = {
          name,
          avatar: user.avatar,
          email,
          phone,
          department,
          employeeNumber,
          active
        };

        if (deleteAvatar === 'true') {
          data = { ...data, avatar: '' };

          try {
            const oldAvatar = path.join(
              __dirname,
              '../public/avatar',
              user.avatar
            );
            fs.unlinkSync(oldAvatar);
          } catch (err) {
            return next(err);
          }
        }

        if (password) {
          const hashedPassword = await authUtils.hashPassword(password);
          data.password = hashedPassword;
        }

        await prisma.user.update({
          where: { id },
          data
        });
      }

      res.status(200).json({
        success: true,
        message: 'User updated successfully'
      });
    } catch (err) {
      next(err);
    }
  });
});

/**
 * @route DELETE /admin/users/
 * @desc Delete given users
 */
exports.deleteUsers = catchAsync(async (req, res, next) => {
  const { userIds } = req.body;

  // Delete avatars
  for await (const userId of userIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (user && user.avatar) {
      const avatarPath = path.join(__dirname, '../public/avatar', user.avatar);

      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }
  }

  await prisma.message.deleteMany({
    where: { read: { some: { userId: { in: userIds } } } }
  });

  await prisma.message.deleteMany({
    where: { createdById: { in: userIds } }
  });

  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });

  res.status(200).json({
    success: true,
    message: `Deleted ${deletedUsers.count} users`
  });
});

/**
 * @route PUT /admin/users/make-subadmins
 * @desc Make given users as subadmins
 */
exports.makeUsersAsSubAdmins = catchAsync(async (req, res, next) => {
  const { userIds } = req.body;

  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { type: Prisma.UserType.subAdmin }
  });

  res.status(200).json({
    success: true,
    message: 'Users updated successfully'
  });
});

/**
 * @route GET /admin/subadmins?page=<int>&limit=<int>&query=<string>
 * @desc Get all users
 */
exports.getSubAdmins = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skipIndex = (page - 1) * limit;

  const count = await prisma.user.count({
    where: {
      type: 'subAdmin',
      OR: [
        { name: { contains: req.query.search } },
        { email: { contains: req.query.search } },
        { phone: { contains: req.query.search } },
        { department: { contains: req.query.search } },
        { employeeNumber: { contains: req.query.search } }
      ]
    }
  });

  const totalPages = Math.ceil(count / limit);

  const subAdmins = await prisma.user.findMany({
    where: {
      type: 'subAdmin',
      OR: [
        { name: { contains: req.query.search } },
        { email: { contains: req.query.search } },
        { phone: { contains: req.query.search } },
        { department: { contains: req.query.search } },
        { employeeNumber: { contains: req.query.search } }
      ]
    },
    select: {
      id: true,
      avatar: true,
      name: true,
      email: true,
      phone: true,
      department: true,
      employeeNumber: true,
      type: true,
      active: true,
      adminApproved: true,
      createdAt: true
    },
    skip: skipIndex,
    take: limit
  });

  res.status(200).json({
    success: true,
    data: subAdmins,
    totalPages
  });
});

/**
 * @route PUT /admin/subadmins/make-users
 * @desc Make given subadmins as users
 */
exports.makeSubAdminsAsUsers = catchAsync(async (req, res, next) => {
  const { subAdminIds } = req.body;

  await prisma.user.updateMany({
    where: { id: { in: subAdminIds } },
    data: { type: Prisma.UserType.user }
  });

  res.status(200).json({
    success: true,
    message: 'SubAdmins updated successfully'
  });
});

/**
 * @route GET /admin/userSubadmins?page=<int>&limit=<int>&query=<string>
 * @desc Get all userAndSubAdmins
 */
exports.getUserSubAdmins = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skipIndex = (page - 1) * limit;

  const count = await prisma.user.count({
    where: {
      type: 'userAndSubAdmin',
      OR: [
        { name: { contains: req.query.search } },
        { email: { contains: req.query.search } },
        { phone: { contains: req.query.search } },
        { department: { contains: req.query.search } },
        { employeeNumber: { contains: req.query.search } }
      ]
    }
  });

  const totalPages = Math.ceil(count / limit);

  const users = await prisma.user.findMany({
    where: {
      type: 'userAndSubAdmin',
      OR: [
        { name: { contains: req.query.search } },
        { email: { contains: req.query.search } },
        { phone: { contains: req.query.search } },
        { department: { contains: req.query.search } },
        { employeeNumber: { contains: req.query.search } }
      ]
    },
    select: {
      id: true,
      avatar: true,
      name: true,
      email: true,
      phone: true,
      department: true,
      employeeNumber: true,
      type: true,
      active: true,
      adminApproved: true,
      createdAt: true
    },
    skip: skipIndex,
    take: limit
  });

  res.status(200).json({
    success: true,
    data: users,
    totalPages
  });
});

/**
 * @route PUT /admin/user-subadmins/make
 * @desc Make given users or subadmins as usersAndSubadmins
 */
exports.convertToUserSubAdmins = catchAsync(async (req, res, next) => {
  const { userIds } = req.body;

  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { type: Prisma.UserType.userAndSubAdmin }
  });

  res.status(200).json({
    success: true,
    message: 'Users updated successfully'
  });
});

/**
 * @route GET /admin/dashboard
 * @desc Get dashboard data for admin ppanel
 */
exports.getDashboardData = catchAsync(async (req, res, next) => {
  const totalUsers = await prisma.user.count({
    where: { type: Prisma.UserType.user }
  });

  const totalSubAdmins = await prisma.user.count({
    where: { type: Prisma.UserType.subAdmin }
  });

  const totalPendingRequests = await prisma.user.count({
    where: { adminApproved: Prisma.AdminApproved.pending }
  });

  const totalGroups = await prisma.group.count();

  const totalMessages = await prisma.message.count();

  const totalRiskAssessments = await prisma.riskAssessment.count();

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      totalSubAdmins,
      totalPendingRequests,
      totalGroups,
      totalMessages,
      totalRiskAssessments
    }
  });
});

/**
 * @route GET /admin/pending-requests?page=<int>&limit=<int>
 * @desc Get all users
 */
exports.getPendingRequests = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const searchQuery = req.query.search;
  const skipIndex = (page - 1) * limit;
  const where = { adminApproved: { equals: 'pending' } };

  if (searchQuery) {
    where.OR = [
      { name: { contains: searchQuery, mode: 'insensitive' } },
      { email: { contains: searchQuery, mode: 'insensitive' } },
      { phone: { contains: searchQuery, mode: 'insensitive' } },
      { department: { contains: searchQuery, mode: 'insensitive' } },
      { employeeNumber: { contains: searchQuery, mode: 'insensitive' } }
    ];
  }

  const users = await prisma.user.findMany({
    where,
    skip: skipIndex,
    take: limit,
    select: {
      id: true,
      avatar: true,
      name: true,
      email: true,
      phone: true,
      department: true,
      employeeNumber: true,
      type: true,
      adminApproved: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalUsers = await prisma.user.count({ where });
  const totalPages = Math.ceil(totalUsers / limit);

  res.status(200).json({
    success: true,
    data: users,
    totalPages
  });
});

/**
 * @route PUT /admin/update-admin-approved/:id
 * @desc Set 'adminApproved' value for a user
 */
exports.updateAdminApproved = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');
  const { adminApproved } = req.body;

  const user = await prisma.user.findUnique({
    where: { id }
  });

  if (!user) {
    throw new ErrorResponse('User not found', 404);
  }

  await prisma.user.update({
    where: { id },
    data: { adminApproved }
  });

  return res.json({
    success: true,
    message: 'Admin approval updated successfully'
  });
});

/**
 * @route GET /admin/groups?page=<int>&limit=<int>&query=<string>
 * @desc Get all groups
 */
exports.getGroups = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const searchQuery = req.query.search;
  const skipIndex = (page - 1) * limit;
  let filter = {};

  const count = await prisma.group.count({
    where: {
      OR: [{ name: { contains: searchQuery } }]
    }
  });

  const totalPages = Math.ceil(count / limit);

  if (searchQuery) {
    filter = {
      OR: [{ name: { contains: searchQuery } }]
    };
  }

  const groups = await prisma.group.findMany({
    where: filter,
    skip: skipIndex,
    take: limit,
    include: {
      members: {
        select: {
          userId: true
        }
      }
    }
  });

  res.status(200).json({
    success: true,
    data: groups,
    totalPages
  });
});

/**
 * @route POST /admin/groups/
 * @desc Create a group
 */
exports.createGroup = catchAsync(async (req, res, next) => {
  const form = formidable();
  const filename = `${generateRandomString()}.jpg`;

  // Move The File From Temp To Avatar Dir
  const moveFromTemp = async file => {
    const dest = path.join(__dirname, '../public/group-avatar', filename);

    mv(file.avatar.filepath, dest, function (err) {
      if (err) {
        next(err);
      }
    });
  };

  // Parse form
  form.parse(req, async (err, fields, file) => {
    if (err) {
      return next(err);
    }

    const name = fields.name;
    const existingGroup = await prisma.group.findFirst({ where: { name } });

    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: 'Group already exists'
      });
    }

    if (file.avatar) {
      moveFromTemp(file);
      await prisma.group.create({ data: { avatar: filename, name } });
    } else {
      await prisma.group.create({ data: { avatar: '', name } });
    }

    res.status(201).json({
      success: true,
      message: 'Group created successfully'
    });
  });
});

/**
 * @route PUT /admin/groups/:id
 * @desc Update a group
 */
exports.updateGroup = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');
  const form = formidable();
  const filename = `${generateRandomString()}.jpg`;

  // Move The File From Temp To Avatar Dir
  const moveFromTemp = async file => {
    const dest = path.join(__dirname, '../public/group-avatar', filename);

    mv(file.avatar.filepath, dest, function (err) {
      if (err) {
        next(err);
      }
    });
  };

  // Parse form
  form.parse(req, async (err, fields, file) => {
    if (err) {
      return next(err);
    }

    const group = await prisma.group.findUnique({ where: { id } });

    if (!group) {
      throw new ErrorResponse('Group not found', 404);
    }

    const name = fields.name;
    const deleteAvatar = fields.deleteAvatar;

    try {
      if (file.avatar) {
        moveFromTemp(file);

        await prisma.group.update({
          where: { id },
          data: { avatar: filename, name }
        });

        // Delete old avatar
        if (group.avatar.length > 0) {
          try {
            const oldAvatar = path.join(
              __dirname,
              '../public/group-avatar',
              group.avatar
            );
            fs.unlinkSync(oldAvatar);
          } catch (err) {
            return next(err);
          }
        }
      } else {
        let data = {
          name
        };

        if (deleteAvatar === 'true') {
          data = { ...data, avatar: '' };

          try {
            const oldAvatar = path.join(
              __dirname,
              '../public/group-avatar',
              group.avatar
            );
            fs.unlinkSync(oldAvatar);
          } catch (err) {
            return next(err);
          }
        }

        await prisma.group.update({
          where: { id },
          data: { avatar: '', name }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Group updated successfully'
      });
    } catch (err) {
      next(err);
    }
  });
});

/**
 * @route DELETE /admin/groups/
 * @desc Delete given groups
 */
exports.deleteGroup = catchAsync(async (req, res, next) => {
  const groupId = req.body.groupId;
  const uploadFolder = path.join('public', 'group-data');

  const group = await prisma.group.findUnique({
    where: { id: groupId }
  });

  const messages = await prisma.message.findMany({
    where: { groups: { some: { id: groupId } } },
    include: { files: true }
  });

  // Delete Message Files
  for (const message of messages) {
    if (message.files.length > 0) {
      const folderName = message.files[0].name.split('/')[0];
      const folder = path.join(uploadFolder, folderName);

      fs.rm(folder, { recursive: true, force: true }, err => {
        if (err) {
          next(new ErrorResponse('Sorry, Cannot delete group', 500));
        }
      });
    }
  }

  // Delete avatar
  if (group && group.avatar.length > 0) {
    const avatarPath = path.join(
      __dirname,
      '../public/group-avatar',
      group.avatar
    );

    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }
  }

  await prisma.group.delete({ where: { id: groupId } });

  // Delete Messages
  await prisma.message.deleteMany({
    where: {
      groups: {
        some: {
          id: groupId
        }
      }
    }
  });

  res.status(200).json({
    success: true,
    message: `Deleted group successfully`
  });
});

/**
 * @route GET /admin/group/:id
 * @desc Get detailed group data
 */
exports.getGroup = catchAsync(async (req, res, next) => {
  const groupId = parseInt(req.params.id, '10');

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        select: {
          userId: true
        }
      }
    }
  });

  const memberIds = group.members.map(member => member.userId);

  const members = await prisma.user.findMany({
    where: {
      id: {
        in: memberIds
      }
    }
  });

  group.members = members;

  res.status(200).json({
    success: true,
    data: group
  });
});

/**
 * @route PUT /admin/group/:id/make-subadmins
 * @desc Make selected member ids as subadmin
 */
exports.makeMembersSubAdmins = catchAsync(async (req, res, next) => {
  const groupId = parseInt(req.params.id, '10');
  const { memberIds } = req.body;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true }
  });

  if (!group) {
    throw new ErrorResponse('Group not found', 404);
  }

  const groupMemberIds = group.members.map(member => member.userId);

  const isEveryMemberIdAvailable = memberIds.every(id =>
    groupMemberIds.includes(id)
  );

  if (!isEveryMemberIdAvailable) {
    throw new ErrorResponse('Some members are not available in the group', 400);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } }
  });

  if (!users) {
    throw new ErrorResponse('No users found with given members', 404);
  }

  await Promise.all(
    users.map(async user => {
      await prisma.user.update({
        where: { id: user.id },
        data: { type: 'subAdmin' }
      });
    })
  );

  res.status(200).json({
    success: true,
    message: 'Selected members are now subadmins'
  });
});

/**
 * @route PUT /admin/group/:id/make-members
 * @desc Make selected subadmin ids as members again
 */
exports.makeSubAdminsMembers = catchAsync(async (req, res, next) => {
  const groupId = parseInt(req.params.id, '10');
  const { subAdminIds } = req.body;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true }
  });

  if (!group) {
    throw new ErrorResponse('Group not found', 404);
  }

  const groupMemberIds = group.members.map(member => member.userId);

  const isEveryMemberIdAvailable = subAdminIds.every(id =>
    groupMemberIds.includes(id)
  );

  if (!isEveryMemberIdAvailable) {
    throw new ErrorResponse('Some members are not available in the group', 400);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: subAdminIds } }
  });

  if (!users) {
    throw new ErrorResponse('No users found with given members', 404);
  }

  await Promise.all(
    users.map(async user => {
      await prisma.user.update({
        where: { id: user.id },
        data: { type: 'user' }
      });
    })
  );

  res.status(200).json({
    success: true,
    message: 'Selected subAdmins are now members'
  });
});

/**
 * @route PUT /admin/group/:id/members
 * @desc Add given members to a group
 */
exports.addGroupMembers = catchAsync(async (req, res, next) => {
  const groupId = parseInt(req.params.id, '10');
  const { memberIds } = req.body;

  // Find the group by ID
  const group = await prisma.group.findUnique({
    where: { id: groupId }
  });

  if (!group) {
    throw new ErrorResponse('Group not found', 404);
  }

  await prisma.member.createMany({
    data: memberIds.map(userId => ({
      groupId,
      userId
    }))
  });

  // Fetch the FCM tokens of the new members
  const fcmTokens = await prisma.user.findMany({
    where: {
      id: { in: memberIds },
      fcmToken: { not: null }
    },
    select: { fcmToken: true }
  });

  const uniqueTokens = [...new Set(fcmTokens.map(token => token.fcmToken))];

  if (uniqueTokens.length > 0) {
    const groupName = group.name || 'Unknown Group';

    await sendPushNotification({
      title: `You have been added to ${groupName}`,
      body: '',
      tokens: uniqueTokens,
      data: {
        route: 'home'
      }
    });
  }

  res.status(200).json({
    success: true,
    message: 'Members added to group successfully'
  });
});

/**
 * @route DELETE /admin/group/:id/members
 * @desc Delete given members of a group
 */
exports.removeGroupMembers = catchAsync(async (req, res, next) => {
  const groupId = parseInt(req.params.id, '10');
  const { memberIds } = req.body;

  // Find the group by ID
  const group = await prisma.group.findUnique({
    where: { id: groupId }
  });

  if (!group) {
    throw new ErrorResponse('Group not found', 404);
  }

  await prisma.member.deleteMany({
    where: {
      groupId,
      userId: {
        in: memberIds
      }
    }
  });

  // Fetch the FCM tokens of the new members
  const fcmTokens = await prisma.user.findMany({
    where: {
      id: { in: memberIds },
      fcmToken: { not: null }
    },
    select: { fcmToken: true }
  });

  const uniqueTokens = [...new Set(fcmTokens.map(token => token.fcmToken))];

  if (uniqueTokens.length > 0) {
    const groupName = group.name || 'Unknown Group';

    await sendPushNotification({
      title: `You have been removed from ${groupName}`,
      body: '',
      tokens: uniqueTokens,
      data: {
        route: 'home'
      }
    });
  }

  res.status(200).json({
    success: true,
    message: 'Members removed successfully.'
  });
});

/**
 * @route GET /admin/group/:id/search-users
 * @desc Search members who are not in a group already to add them
 */
exports.searchUsersNotInGroup = catchAsync(async (req, res) => {
  const groupId = parseInt(req.params.id, '10');
  const { search } = req.query;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true }
  });

  if (!group) {
    throw new ErrorResponse('Group not found', 404);
  }

  const memberIds = group.members.map(member => member.userId);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { department: { contains: search } },
        { employeeNumber: { contains: search } }
      ],
      type: { not: Prisma.UserType.admin },
      id: { notIn: memberIds }
    },
    take: 20
  });

  res.status(200).json({
    success: true,
    data: users,
    totalPages: 1 // To prevent errors in client side
  });
});

/**
 * @route GET /group/search
 * @desc Search groups by name
 */
exports.searchGroups = catchAsync(async (req, res) => {
  const searchQuery = req.query.search || '';

  const groups = await prisma.group.findMany({
    where: {
      name: {
        contains: searchQuery
      }
    },
    take: 20
  });

  res.status(200).json({
    success: true,
    data: groups
  });
});

/**
 * @route GET /group/:groupId/messages
 * @desc Get all messages of a given group
 */
exports.getMessagesOfGroup = catchAsync(async (req, res) => {
  const groupId = parseInt(req.params.groupId, 10);
  const search = req.query.search;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const group = await prisma.group.findUnique({
    where: {
      id: groupId
    },
    include: {
      messages: {
        where: {
          content: {
            contains: search || ''
          }
        },
        include: {
          files: true,
          createdBy: {
            select: {
              id: true,
              avatar: true,
              name: true
            }
          },
          read: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (page - 1) * limit,
        take: limit
      }
    }
  });

  if (!group) {
    throw new ErrorResponse('Group not found', 404);
  }

  const totalCount = await prisma.message.count({
    where: {
      id: groupId
    }
  });

  const totalPages = Math.ceil(totalCount / limit);

  res.status(200).json({
    success: true,
    data: group.messages,
    totalPages
  });
});

/**
 * @route GET /admin/message/detail/:messageId
 * @desc Return all detailed about a message
 */
exports.getMessage = catchAsync(async (req, res) => {
  const messageId = parseInt(req.params.messageId, '10');
  const userId = req.user.id;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
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
      createdBy: { select: { id: true, avatar: true, name: true } }
    }
  });

  if (!message) {
    throw new ErrorResponse('Message Not Found', 404);
  }

  const messageReadByUser = message.read.find(read => {
    return read.user.id === userId;
  });

  res.status(200).json({
    success: true,
    data: { ...message, messageReadByUser }
  });
});

/**
 * @route GET /message/changes/:messageId
 * @desc Return all changes about a message reads
 */
exports.getMessageChanges = catchAsync(async (req, res) => {
  const messageId = parseInt(req.params.messageId, '10');

  const message = await prisma.message.findUnique({
    where: {
      id: messageId
    },
    include: {
      read: {
        where: {
          reply: { not: null }
        },
        include: {
          user: {
            select: {
              id: true,
              avatar: true,
              name: true,
              email: true,
              employeeNumber: true
            }
          }
        },
        orderBy: {
          readAt: 'desc'
        }
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

  const groupedReads = message.read.reduce((acc, read) => {
    const userId = read.user.id;
    const name = read.user.name;
    const email = read.user.email;

    if (!acc.find(item => item.userId === userId)) {
      acc.push({
        userId,
        name,
        email,
        reads: []
      });
    }

    const userIndex = acc.findIndex(item => item.userId === userId);
    acc[userIndex].reads.push(read);
    return acc;
  }, []);

  res.status(200).json({
    success: true,
    data: groupedReads
  });
});

/**
 * @route POST /admin/message/:groupId
 * @desc Create a new message
 */
exports.createMessage = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const filesArr = [];
  const randomString = generateRandomString();
  const uploadFolder = path.join('public', `group-data/${randomString}`);

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

    const groupIds = fields.groupIds
      .split(',')
      .filter(e => e.length != 0)
      .map(groupId => parseInt(groupId, 10));

    await prisma.message.create({
      data: {
        title: fields.title,
        content: fields.content,
        groups: {
          connect: fields.groupIds
            .split(',')
            .filter(e => e.length != 0)
            .map(groupId => ({ id: parseInt(groupId, 10) }))
        },
        timer: parseInt(fields.timer),
        createdBy: { connect: { id: userId } },
        files: { createMany: { data: filesArr } },
        read: {
          createMany: {
            data: groupIds.map(groupId => ({ userId, groupId }))
          }
        }
      },
      include: {
        createdBy: {
          select: {
            id: true,
            avatar: true,
            name: true
          }
        }
      }
    });

    // Send Notification To Members Of The Group
    const fcmTokenQuery = await prisma.group.findMany({
      where: {
        id: {
          in: groupIds
        }
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

    const membersFcmTokens = Array.from(
      new Set(
        fcmTokenQuery.flatMap(group =>
          group.members.map(member => member.user.fcmToken)
        )
      )
    );

    if (membersFcmTokens.length > 0) {
      await sendPushNotification({
        title: `New Message On Group`,
        body: fields.content,
        tokens: membersFcmTokens,
        data: {
          groupIds: JSON.stringify(groupIds),
          route: 'home'
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message Created'
    });
  });
});

/**
 * @route PUT /admin/message/:messageId
 * @desc Updates a message
 */
exports.updateMessage = catchAsync(async (req, res, next) => {
  const messageId = parseInt(req.params.messageId, '10');
  const { title, content, timer, files } = req.body;
  const uploadFolder = path.join('public', 'group-data');

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { files: true }
  });

  if (!message) {
    return new ErrorResponse('Message not found', 404);
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

  await prisma.message.update({
    where: { id: messageId },
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
 * @route DELETE /admin/message/:messageId/
 * @desc Delete given messages of a group
 */
exports.deleteMessage = catchAsync(async (req, res, next) => {
  const messageId = parseInt(req.params.messageId, '10');
  const uploadFolder = path.join('public', 'group-data');

  // Find the messages in the group
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { files: true }
  });

  if (!message) {
    return new ErrorResponse('Message Not Found', 404);
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

  await prisma.message.delete({ where: { id: messageId } });

  res.status(200).json({
    success: true,
    message: 'Message deleted'
  });
});

/**
 * @route GET admin/message/read-status/:id/:groupId
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
 * @route POST /admin/risk-assessment
 * @desc Upload a risk assessment document
 */
exports.createRiskAssessment = catchAsync(async (req, res, next) => {
  const form = new formidable.IncomingForm();
  const uploadFolder = path.join('public', 'risk-assessment');

  // Basic Configuration
  form.multiples = false;
  form.maxFileSize = 200 * 1024 * 1024; // 20MB
  form.uploadDir = uploadFolder;

  const isFileValid = file => {
    const type = file.originalFilename.split('.').pop();
    const validTypes = ['pdf'];

    if (validTypes.indexOf(type) === -1) {
      return false;
    }

    return true;
  };

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return next(new ErrorResponse(err, 400));
    }

    const file = files.file;
    const groupId = parseInt(fields.groupId, 10);

    if (!isFileValid(file)) {
      return next(new ErrorResponse('File Type Not Supported', 400));
    }

    try {
      fs.renameSync(
        file.filepath,
        path.join(uploadFolder, file.originalFilename)
      );

      const newFile = await prisma.riskAssessment.create({
        data: {
          name: file.originalFilename,
          groupId
        }
      });

      // Get members of the group
      const groupMembers = await prisma.member.findMany({
        where: { groupId },
        select: {
          user: {
            select: {
              fcmToken: true
            }
          }
        }
      });

      // Extract unique FCM tokens from the fetched list
      const fcmTokens = [
        ...new Set(groupMembers.map(token => token.user.fcmToken))
      ];

      if (fcmTokens.length > 0) {
        const group = await prisma.group.findUnique({
          where: { id: groupId },
          select: { name: true }
        });

        const groupName = group?.name || 'Unknown Group';

        await sendPushNotification({
          title: `New Risk Assessment Uploaded On "${groupName}"`,
          body: file.originalFilename,
          tokens: fcmTokens,
          data: {
            route: 'risk-assessment'
          }
        });
      }

      res.status(201).json({ success: true, data: newFile });
    } catch (error) {
      return next(error);
    }
  });
});

/**
 * @route PUT /admin/risk-assessment/:id
 * @desc Update a risk assessment document with different name
 */
exports.updateRiskAssessment = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');
  const { name } = req.body;

  const riskAssessment = await prisma.riskAssessment.findUnique({
    where: { id }
  });

  const uploadFolder = path.join('public', 'risk-assessment');

  if (!riskAssessment) {
    throw new ErrorResponse('Risk Assessment Not Found', 404);
  }

  fs.renameSync(
    path.join(uploadFolder, riskAssessment.name),
    path.join(uploadFolder, `${name}.pdf`)
  );

  await prisma.riskAssessment.update({
    where: {
      id: id
    },
    data: {
      name: `${name}.pdf`
    }
  });

  res.status(200).json({
    success: true,
    message: 'Risk Assessment Updated Successfully'
  });
});

/**
 * @route DELETE /admin/risk-assessment/:id
 * @desc Delete a risk assessment document
 */
exports.deleteRiskAssessment = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');

  const riskAssessment = await prisma.riskAssessment.findUnique({
    where: { id }
  });

  const uploadFolder = path.join('public', 'risk-assessment');

  if (!riskAssessment) {
    throw new ErrorResponse('Risk Assessment Not Found', 404);
  }

  fs.unlink(path.join(uploadFolder, riskAssessment.name), async err => {
    if (err) {
      next(new ErrorResponse('Cannot Delete Risk Assessment', 500));
    } else {
      await prisma.riskAssessment.delete({
        where: {
          id: id
        }
      });

      res.status(200).json({
        success: true,
        message: 'Risk Assessment Deleted Successfully'
      });
    }
  });
});

/**
 * @route POST /admin/other-file
 * @desc Upload a other file document
 */
exports.uploadOtherFile = catchAsync(async (req, res, next) => {
  const form = new formidable.IncomingForm();
  const uploadFolder = path.join('public', 'other-file');

  // Basic Configuration
  form.multiples = false;
  form.maxFileSize = 200 * 1024 * 1024; // 20MB
  form.uploadDir = uploadFolder;

  const isFileValid = file => {
    const type = file.originalFilename.split('.').pop();
    const validTypes = ['pdf'];

    if (validTypes.indexOf(type) === -1) {
      return false;
    }

    return true;
  };

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return next(new ErrorResponse(err, 400));
    }

    const file = files.file;

    if (!isFileValid(file)) {
      return next(new ErrorResponse('File Type Not Supported', 400));
    }

    try {
      fs.renameSync(
        file.filepath,
        path.join(uploadFolder, file.originalFilename)
      );

      const newFile = await prisma.otherFile.create({
        data: {
          name: file.originalFilename
        }
      });

      // Fetch the FCM tokens of the users
      const fcmTokens = await prisma.user.findMany({
        where: {
          fcmToken: { not: null },
          type: { not: { equals: Prisma.UserType.admin } }
        },
        select: { fcmToken: true }
      });

      const uniqueTokens = [...new Set(fcmTokens.map(token => token.fcmToken))];

      if (uniqueTokens.length > 0) {
        await sendPushNotification({
          title: `New Document Uploaded On Other Files`,
          body: file.originalFilename,
          tokens: uniqueTokens,
          data: {
            route: 'other-files'
          }
        });
      }

      res.status(201).json({ success: true, data: newFile });
    } catch (error) {
      return next(error);
    }
  });
});

/**
 * @route PUT /admin/other-file/:id
 * @desc Update a risk assessment document with different name
 */
exports.updateOtherFile = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');
  const { name } = req.body;

  const otherFile = await prisma.otherFile.findUnique({
    where: { id }
  });

  const uploadFolder = path.join('public', 'other-file');

  if (!otherFile) {
    throw new ErrorResponse('File Not Found', 404);
  }

  fs.renameSync(
    path.join(uploadFolder, otherFile.name),
    path.join(uploadFolder, `${name}.pdf`)
  );

  await prisma.otherFile.update({
    where: {
      id: id
    },
    data: {
      name: `${name}.pdf`
    }
  });

  res.status(200).json({
    success: true,
    message: 'Other File Updated Successfully'
  });
});

/**
 * @route DELETE /admin/other-file/:id
 * @desc Delete a risk assessment document
 */
exports.deleteOtherFile = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');

  const otherFile = await prisma.otherFile.findUnique({
    where: { id }
  });

  const uploadFolder = path.join('public', 'other-file');

  if (!otherFile) {
    throw new ErrorResponse('File Not Found', 404);
  }

  fs.unlink(path.join(uploadFolder, otherFile.name), async err => {
    if (err) {
      next(new ErrorResponse('Cannot Delete File', 500));
    } else {
      await prisma.otherFile.delete({
        where: {
          id: id
        }
      });

      res.status(200).json({
        success: true,
        message: 'File Deleted Successfully'
      });
    }
  });
});

/**
 * @route GET /admin/user-orientation/:id
 * @desc Get a user orientation item information
 */
exports.getUserOrientationInfo = catchAsync(async (req, res, next) => {
  const userOrientationId = parseInt(req.params.id, 10);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skipIndex = (page - 1) * limit;

  // Retrieve the user orientation item
  const userOrientation = await prisma.userOrientation.findUnique({
    where: {
      id: userOrientationId
    },
    include: {
      userOrientationReads: {
        select: {
          readAt: true,
          user: {
            select: {
              id: true,
              avatar: true,
              name: true,
              email: true
            }
          }
        },
        skip: skipIndex,
        take: limit
      }
    }
  });

  if (!userOrientation) {
    throw new ErrorResponse('User orientation item not found', 404);
  }

  const count = await prisma.userOrientation.count();
  const totalPages = Math.ceil(count / limit);

  res.status(200).json({
    success: true,
    data: userOrientation,
    totalPages: totalPages
  });
});

/**
 * @route POST /admin/user-orienation
 * @desc Upload a user orienation item
 */
exports.uploadUserOrienationItem = catchAsync(async (req, res, next) => {
  const form = new formidable.IncomingForm();
  const uploadFolder = path.join('public', 'user-orientation');

  // Basic Configuration
  form.multiples = false;
  form.maxFileSize = 200 * 1024 * 1024; // 20MB
  form.uploadDir = uploadFolder;

  const isFileValid = file => {
    const type = file.originalFilename.split('.').pop();
    const validTypes = ['pdf'];

    if (validTypes.indexOf(type) === -1) {
      return false;
    }

    return true;
  };

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return next(new ErrorResponse(err, 400));
    }

    const file = files.file;

    if (!isFileValid(file)) {
      return next(new ErrorResponse('File Type Not Supported', 400));
    }

    try {
      fs.renameSync(
        file.filepath,
        path.join(uploadFolder, file.originalFilename)
      );

      const newFile = await prisma.userOrientation.create({
        data: {
          name: file.originalFilename
        }
      });

      // Fetch the FCM tokens of the users
      const fcmTokens = await prisma.user.findMany({
        where: {
          fcmToken: { not: null },
          type: { not: { equals: Prisma.UserType.admin } }
        },
        select: { fcmToken: true }
      });

      const uniqueTokens = [...new Set(fcmTokens.map(token => token.fcmToken))];

      if (uniqueTokens.length > 0) {
        await sendPushNotification({
          title: `New Document Uploaded On User Orientation`,
          body: file.originalFilename,
          tokens: uniqueTokens,
          data: {
            route: 'user-orientation'
          }
        });
      }

      res.status(201).json({ success: true, data: newFile });
    } catch (error) {
      return next(error);
    }
  });
});

/**
 * @route PUT /admin/user-orienation
 * @desc Update a user orienation item
 */
exports.updateUserOrientationItem = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');
  const { name } = req.body;

  const userOrientationItem = await prisma.userOrientation.findUnique({
    where: { id }
  });

  const uploadFolder = path.join('public', 'user-orientation');

  if (!userOrientationItem) {
    throw new ErrorResponse('File Not Found', 404);
  }

  fs.renameSync(
    path.join(uploadFolder, userOrientationItem.name),
    path.join(uploadFolder, `${name}.pdf`)
  );

  await prisma.userOrientation.update({
    where: {
      id
    },
    data: {
      name: `${name}.pdf`
    }
  });

  res.status(200).json({
    success: true,
    message: 'User Orientation Item Updated Successfully'
  });
});

/**
 * @route DELETE /admin/user-orienation
 * @desc Delete a user orienation item
 */
exports.deleteUserOrientationItem = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');

  const userOrientationItem = await prisma.userOrientation.findUnique({
    where: { id }
  });

  const uploadFolder = path.join('public', 'user-orientation');

  if (!userOrientationItem) {
    throw new ErrorResponse('File Not Found', 404);
  }

  fs.unlink(path.join(uploadFolder, userOrientationItem.name), async err => {
    if (err) {
      next(new ErrorResponse('Cannot Delete File', 500));
    } else {
      await prisma.userOrientation.delete({
        where: {
          id: id
        }
      });

      res.status(200).json({
        success: true,
        message: 'File Deleted Successfully'
      });
    }
  });
});

/**
 * @route GET /admin/feedback-dashboard
 * @desc Get feedback dashboard
 */
exports.getFeedbackDashboard = catchAsync(async (req, res, next) => {
  const totalFeedback = await prisma.feedback.count();

  const redFeedback = await prisma.feedback.count({
    where: {
      color: 'red'
    }
  });

  const yellowFeedback = await prisma.feedback.count({
    where: {
      color: 'yellow'
    }
  });

  const greenFeedback = await prisma.feedback.count({
    where: {
      color: 'green'
    }
  });

  const inProgress = await prisma.feedback.count({
    where: {
      status: 'inProgress'
    }
  });

  const rejected = await prisma.feedback.count({
    where: {
      status: 'rejected'
    }
  });

  const closed = await prisma.feedback.count({
    where: {
      status: 'closed'
    }
  });

  const closedWithoutAction = await prisma.feedback.count({
    where: {
      status: 'closedWithoutAction'
    }
  });

  res.status(200).json({
    success: true,
    data: {
      totalFeedback,
      redFeedback,
      yellowFeedback,
      greenFeedback,
      inProgress,
      rejected,
      closed,
      closedWithoutAction
    }
  });
});

/**
 * @route GET /admin/feedback?page=<int>&limit=<int>&query=<string>
 * @desc Get feedbacks
 */
exports.getFeedbacks = catchAsync(async (req, res, next) => {
  const { page, limit, query } = req.query;
  const pageNumber = parseInt(page, 10) || 1;
  const pageSize = parseInt(limit, 10) || 10;
  const searchTerm = query || '';
  const skip = (pageNumber - 1) * pageSize;
  const color = req.query.color || 'all';
  const status = req.query.status || 'all';

  let whereClause = {
    OR: [
      { location: { contains: searchTerm } },
      { organizationName: { contains: searchTerm } },
      { feedback: { contains: searchTerm } },
      { source: { contains: searchTerm } },
      { description: { contains: searchTerm } },
      { reportedBy: { contains: searchTerm } }
    ]
  };

  if (color !== 'all') {
    whereClause.color = color;
  }

  if (status !== 'all') {
    whereClause.status = status;
  }

  const feedbacks = await prisma.feedback.findMany({
    where: whereClause,
    skip: skip,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: {
          id: true,
          avatar: true,
          name: true,
          email: true,
          phone: true
        }
      },
      files: {
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
      actionFiles: {
        select: {
          id: true,
          fileType: true,
          name: true
        }
      }
    }
  });

  const totalFeedbacks = await prisma.feedback.count({
    where: whereClause
  });

  const totalPages = Math.ceil(totalFeedbacks / pageSize);

  res.status(200).json({
    success: true,
    data: feedbacks,
    totalPages: totalPages
  });
});

/**
 * @route GET /admin/feedback/search-users
 * @desc Get users to assign for a feedback report
 */
exports.searchUsersToAssign = catchAsync(async (req, res, next) => {
  const { search } = req.query;

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { department: { contains: search } },
        { employeeNumber: { contains: search } }
      ],
      type: { not: Prisma.UserType.admin }
    },
    take: 20,
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      phone: true,
      department: true,
      employeeNumber: true,
      type: true
    }
  });

  res.status(200).json({
    success: true,
    data: users
  });
});

/**
 * @route POST /admin/feedback/:id/assign-users
 * @desc Assign users for a given feedback
 */
exports.assignFeedbackUsers = catchAsync(async (req, res, next) => {
  const feedbackId = parseInt(req.params.id, 10);
  const { userId } = req.body;

  // Retrieve the feedback
  const feedback = await prisma.feedback.findUnique({
    where: {
      id: feedbackId
    }
  });

  // Check if the feedback exists
  if (!feedback) {
    throw new ErrorResponse('Feedback not found', 404);
  }

  // Retrieve the users to assign
  const userToAssign = await prisma.user.findUnique({
    where: {
      id: userId
    }
  });

  // Check if the user exists
  if (!userToAssign) {
    throw new ErrorResponse('User not found', 404);
  }

  // Delete any existing assignments for the feedback
  await prisma.feedbackAssignment.deleteMany({
    where: {
      feedbackId: feedback.id
    }
  });

  // Create new assignment for the feedback
  const assignmentData = {
    assignmentCompleted: false,
    feedbackId: feedback.id,
    userId: userToAssign.id
  };

  await prisma.feedbackAssignment.create({
    data: assignmentData
  });

  // Fetch the updated feedback with assigned users
  const data = await prisma.feedback.findUnique({
    where: {
      id: feedbackId
    },
    include: {
      createdBy: true,
      feedbackAssignments: {
        include: {
          user: {
            select: {
              id: true,
              avatar: true,
              name: true,
              email: true,
              fcmToken: true
            }
          }
        }
      },
      files: true
    }
  });

  const fcmTokens = [
    ...new Set(
      data.feedbackAssignments
        .map(assignment => assignment.user.fcmToken)
        .filter(token => !!token)
    )
  ];

  // Send push notification if there are any FCM tokens
  if (fcmTokens.length > 0) {
    await sendPushNotification({
      title: 'New Feedback Assignment',
      body: `"FB${data.id}" Assigned For You`,
      tokens: fcmTokens,
      data: {
        route: 'assigned-feedbacks'
      }
    });
  }

  res.status(200).json({
    success: true,
    data
  });
});

/**
 * @route PUT /admin/feedback/:id
 * @desc Update a feedback from admin
 */
exports.updateFeedback = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.id, '10');
  const { responsiblePerson, actionTaken, status } = req.body;

  const feedback = await prisma.feedback.findFirst({
    where: { id },
    select: {
      createdBy: {
        select: {
          fcmToken: true
        }
      }
    }
  });

  if (!feedback) {
    throw new ErrorResponse('Feedback not exist', 404);
  }

  try {
    const newFeedback = await prisma.feedback.update({
      where: { id },
      data: {
        responsiblePerson,
        actionTaken,
        status
      }
    });

    // Send notification on feedback closed
    if (newFeedback.status === 'closed' && feedback.createdBy.fcmToken) {
      await sendPushNotification({
        title: `FB:${id} Feedback Update: ${status}`,
        body: '',
        tokens: [feedback.createdBy.fcmToken],
        data: {
          route: 'feedbacks'
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Feedback updated successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route DELETE /admin/feedback
 * @desc Delete feedbacks
 */
exports.deleteFeedbacks = catchAsync(async (req, res, next) => {
  const { feedbackIds } = req.body;
  const uploadFolder = path.join('public', 'feedback-data');

  // Delete feedback photos
  for await (const feedbackId of feedbackIds) {
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: { files: true }
    });

    if (feedback.files.length > 0) {
      const folderName = feedback.files[0].name.split('/')[0];
      const folder = path.join(uploadFolder, folderName);

      fs.rm(folder, { recursive: true, force: true }, err => {
        if (err) {
          next(new ErrorResponse('Sorry, Cannot delete feedback files', 500));
        }
      });
    }
  }

  const deletedFeedbacks = await prisma.feedback.deleteMany({
    where: { id: { in: feedbackIds } }
  });

  res.status(200).json({
    success: true,
    message: `Deleted ${deletedFeedbacks.count} feedbacks`
  });
});



exports.getMeetingInfo = (req, res) => {
  console.log('Received request to get meeting information.');

  // You can add more meaningful information or data here
  const message = 'Meeting information is not available in this example.';

  // Send a response
  res.status(200).json({
    success: true,
    message,
  });
};
