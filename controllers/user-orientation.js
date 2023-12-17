const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');

/**
 * @route GET /user-orientation/?page=<int>&limit=<int>
 * @desc Get all user orientation items
 */
exports.getAllUserOrientationItems = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search;
  const skipIndex = (page - 1) * limit;
  const searchOptions = {};

  if (search) {
    searchOptions.name = { contains: search, mode: 'insensitive' };
  }

  const count = await prisma.otherFile.count({
    where: searchOptions
  });

  const totalPages = Math.ceil(count / limit);

  const userOrientationFileItems = await prisma.userOrientation.findMany({
    where: searchOptions,
    skip: skipIndex,
    take: limit
  });

  res.status(200).json({
    success: true,
    data: userOrientationFileItems,
    totalPages
  });
});

/**
 * @route POST /user-orientation/:id
 * @desc Read a user orientation item
 */
exports.readUserOrientationItem = catchAsync(async (req, res) => {
  const { id } = parseInt(req.params, 10);
  const userId = req.user.id;

  // Check if the user orientation item exists
  const userOrientationItem = await prisma.userOrientation.findUnique({
    where: {
      id
    }
  });

  if (!userOrientationItem) {
    throw new ErrorResponse('User orientation item not found', 404);
  }

  // Check if the user has already read the item
  const userOrientationRead = await prisma.userOrientationRead.findFirst({
    where: {
      userOrientationId: id,
      userId
    }
  });

  if (userOrientationRead) {
    return res.status(200).json({
      success: true,
      message: 'User orientation item already read'
    });
  }

  await prisma.userOrientationRead.create({
    data: {
      userOrientationId: id,
      userId
    }
  });

  res.status(201).json({
    success: true,
    message: 'User orientation item read'
  });
});
