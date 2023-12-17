const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const ErrorResponse = require('../utils/errorResponse');
const prisma = require('../config/prisma');

const isAuthenticated = async req => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else {
    // No Token
    return false;
  }

  // JWT Verification
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    // Refuse to login if user's account is marked as inactive.
    if (!user.active) {
      return false;
    } else {
      req.user = user;
      return true;
    }
  } catch (err) {
    return false;
  }
};

const protect = catchAsync(async (req, _, next) => {
  if (await isAuthenticated(req)) {
    next();
  } else {
    next(new ErrorResponse('Not Authorized To Access This Route', 401));
  }
});

const authorize = (...roles) => {
  return catchAsync(async (req, _, next) => {
    if ((await isAuthenticated(req)) && roles.includes(req.user?.type)) {
      next();
    } else {
      next(new ErrorResponse('Not Authorized To Access This Route', 401));
    }
  });
};

module.exports = { protect, authorize, isAuthenticated };
