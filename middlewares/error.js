const colors = require('colors');
const ErrorResponse = require('../utils/errorResponse');
const { Prisma } = require('@prisma/client');

const errorHandler = (err, req, res, next) => {
  console.error(`${err}`.red);

  let error = { ...err };
  error.message = err.message;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique cnstraint failed
    if (err.code === 'P2002') {
      error = new ErrorResponse(`${err.meta.target} already exists`, 404);
    }

    // Required value not given
    if (err.code === 'P2012') {
      error = new ErrorResponse(`${err.meta.target} is Required`, 404);
    }
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Internal Server Error'
  });
};

module.exports = errorHandler;
