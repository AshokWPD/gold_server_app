const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');

/**
 * @route GET /other-file/?page=<int>&limit=<int>
 * @desc Get all other files items
 */
exports.getAllFiles = catchAsync(async (req, res) => {
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

  const otherFileItems = await prisma.otherFile.findMany({
    where: searchOptions,
    skip: skipIndex,
    take: limit
  });

  res.status(200).json({
    success: true,
    data: otherFileItems,
    totalPages
  });
});
