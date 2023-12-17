const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');
const ErrorResponse = require('../utils/errorResponse');
const Prisma = require('@prisma/client');

/**
 * @route GET /group?page=<int>&limit=<int>
 * @desc Return all groups which the user belongs to
 */
exports.getAllGroups = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { page = 1, limit = 10 } = req.query;

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    orderBy: { createdAt: 'asc' }
  };

  const groups = await prisma.group.findMany({
    where: {
      members: {
        some: {
          userId
        }
      }
    },
    include: {
      messages: {
        select: {
          id: true,
          content: true,
          createdBy: true,
          createdAt: true,
          read: {
            select: {
              id: true,
              reply: true,
              readAt: true,
              userId: true,
              groupId: true
            }
          }
        }
      }
    },
    skip: options.skip,
    take: options.limit,
    orderBy: options.orderBy
  });

  const filteredGroups = groups.map(group => {
    const unreadMessages = group.messages.filter(
      message =>
        !message.read.some(
          read => read.userId === userId && read.groupId === group.id
        ) && message.createdBy !== userId
    );

    return { ...group, unreadMessages };
  });

  const result = filteredGroups.map(({ messages, ...group }) => group);
  res.status(200).json({ success: true, data: result });
});

/**
 * @route GET /group/:id
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
 * @route GET /:id/members
 * @desc Return members of a group
 */
exports.getGroupMembers = catchAsync(async (req, res, next) => {
  const groupId = parseInt(req.params.id, '10');
  const userId = req.user.id;

  const group = await prisma.group.findFirst({
    where: {
      AND: [
        {
          id: groupId
        },
        {
          members: {
            some: {
              userId
            }
          }
        }
      ]
    },
    include: {
      members: true
    }
  });

  if (!group) {
    throw new ErrorResponse(
      "Group does not exist (or) You don't have access to this group",
      400
    );
  }

  const memberIds = group.members.map(member => member.userId);

  const members = await prisma.user.findMany({
    where: {
      id: {
        in: memberIds
      }
    }
  });

  res.status(200).json({
    success: true,
    data: members
  });
});

/**
 * @route GET /:id/search-users
 * @desc Search members who are not in a group already to add them
 */
exports.searchUsersToAdd = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const groupId = parseInt(req.params.id, '10');
  const { search } = req.query;

  const group = await prisma.group.findFirst({
    where: {
      AND: [
        {
          id: groupId
        },
        {
          members: {
            some: {
              userId
            }
          }
        }
      ]
    },
    include: {
      members: true
    }
  });

  if (!group) {
    throw new ErrorResponse(
      "Group does not exist (or) You don't have access to this group",
      400
    );
  }

  const memberIds = group.members.map(member => member.userId);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        {
          name: {
            contains: search
          }
        },
        {
          email: {
            contains: search
          }
        },
        {
          phone: {
            contains: search
          }
        },
        {
          department: {
            contains: search
          }
        },
        {
          employeeNumber: {
            contains: search
          }
        }
      ],
      type: {
        not: Prisma.UserType.admin
      },
      id: {
        notIn: memberIds
      }
    },
    take: 20
  });

  res.status(200).json({
    success: true,
    data: users
  });
});

/**
 * @route PUT /group/:id/members
 * @desc Add given members to a group
 */
exports.addGroupMember = catchAsync(async (req, res, next) => {
  const groupId = parseInt(req.params.id, '10');
  const userId = req.user.id;
  const { memberId } = req.body;

  // Find the group by ID
  const group = await prisma.group.findFirst({
    where: {
      AND: [
        {
          id: groupId
        },
        {
          members: {
            some: {
              userId
            }
          }
        }
      ]
    }
  });

  if (!group) {
    throw new ErrorResponse(
      "Group does not exist (or) You don't have access to this group",
      400
    );
  }

  await prisma.member.create({
    data: {
      groupId,
      userId: memberId
    }
  });

  res.status(200).json({
    success: true,
    message: 'Member added to group successfully'
  });
});

/**
 * @route DELETE /group/:id/members
 * @desc Delete given members of a group
 */
exports.removeGroupMember = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const groupId = parseInt(req.params.id, '10');
  const { memberId } = req.body;

  // Find the group by ID
  const group = await prisma.group.findFirst({
    where: {
      AND: [
        {
          id: groupId
        },
        {
          members: {
            some: {
              userId
            }
          }
        }
      ]
    }
  });

  if (!group) {
    throw new ErrorResponse(
      "Group does not exist (or) You don't have access to this group",
      400
    );
  }

  await prisma.member.delete({
    where: {
      groupId_userId: {
        groupId,
        userId: memberId
      }
    }
  });

  res.status(200).json({
    success: true,
    message: 'Member removed successfully.'
  });
});
