const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');

/**
 * @route GET /master-list?page=<int>&limit=<int>&search=<string>
 * @desc Get master list content
 */
exports.getMasterList = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skipIndex = (page - 1) * limit;
  const searchQuery = req.query.search || '';

  let filter = {
    OR: [
      { name: { contains: searchQuery } },
      { fileType: { contains: searchQuery } }
    ]
  };

  const messageId = parseInt(searchQuery, 10);

  if (!isNaN(messageId)) {
    filter = { messageId: { equals: messageId } };
  }

  const count = await prisma.message.count({
    where: {
      OR: [
        { title: { contains: searchQuery } },
        { content: { contains: searchQuery } }
      ]
    }
  });
  const totalPages = Math.ceil(count / limit);

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { title: { contains: searchQuery } },
        { content: { contains: searchQuery } }
      ]
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      createdBy: {
        select: {
          avatar: true,
          name: true,
          email: true
        }
      },
      read: {
        where: { user: { NOT: { type: 'admin' } } },
        select: {
          id: true,
          userId: true,
          groupId: true,
          mode: true,
          reply: true
        },
        distinct: ['userId'],
        orderBy: { id: 'desc' }
      },
      files: {
        select: {
          id: true,
          fileType: true,
          name: true
        }
      },
      groups: {
        select: {
          id: true,
          name: true,
          members: {
            include: {
              user: {
                select: {
                  id: true
                }
              }
            }
          }
        }
      }
    },
    skip: skipIndex,
    take: limit
  });

  const modifiedMessages = messages.map(message => {
    const modifiedGroups = message.groups.map(group => {
      const groupMembers = new Set(group.members.map(member => member.user.id));
      const readUsers = new Set();
      const clarifyUsers = new Set();

      message.read.forEach(r => {
        if (groupMembers.has(r.userId)) {
          if (r.groupId === group.id) {
            if (r.reply === 'Need Clarification') {
              clarifyUsers.add(r.userId);
            } else {
              readUsers.add(r.userId);
            }
          }
        }
      });

      const readUsersTotalSize = readUsers.size + clarifyUsers.size;

      return {
        ...group,
        members: undefined,
        readUsersCount: readUsers.size,
        clarifyUsersCount: clarifyUsers.size,
        unReadUsersCount: groupMembers.size - readUsersTotalSize
      };
    });

    return {
      ...message,
      read: undefined,
      groups: modifiedGroups
    };
  });

  res.status(200).json({
    success: true,
    data: modifiedMessages,
    totalPages
  });
});
