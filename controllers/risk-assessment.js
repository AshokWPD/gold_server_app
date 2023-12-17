const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');

/**
 * @route GET /risk-assessment/:groupId?page=<int>&limit=<int>
 * @desc Get all risk assessment items
 */
exports.getAllAssessmentItems = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search;
  const groupId = parseInt(req.params.groupId, 10);
  const skipIndex = (page - 1) * limit;

  const searchOptions = {
    groupId
  };

  if (search) {
    searchOptions.name = { contains: search, mode: 'insensitive' };
  }

  const count = await prisma.riskAssessment.count({
    where: searchOptions
  });

  const totalPages = Math.ceil(count / limit);

  const riskAssessmentItems = await prisma.riskAssessment.findMany({
    where: searchOptions,
    skip: skipIndex,
    take: limit
  });

  res.status(200).json({
    success: true,
    data: riskAssessmentItems,
    totalPages
  });
});
