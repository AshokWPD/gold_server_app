const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const formidable = require('formidable');
const mv = require('mv');
const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');
const ErrorResponse = require('../utils/errorResponse');
const Email = require('../utils/email');
const authUtils = require('../utils/auth');
const { generateRandomString } = require('../utils/functions');

/**
 * @route POST /auth/login
 * @desc let's the user login
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password, fcmToken } = req.body;

  // Validate email & password
  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { password: true, id: true, active: true }
  });

  // User Not Found In DB
  if (!user) {
    return next(new ErrorResponse('Invalid Email Or Password', 401));
  }

  if (!user.active) {
    return next(new ErrorResponse('Inactive Account', 401));
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

  sendTokenResponse(user.id, 200, res);
});

/**
 * @route POST /auth/register
 * @desc let's the user register
 */
exports.register = catchAsync(async (req, res) => {
  const {
    name,
    email,
    phone,
    department,
    employeeNumber,
    password,
    fcmToken
    // Added for formatting
  } = req.body;

  const hashedPassword = await authUtils.hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      department,
      employeeNumber,
      fcmToken,
      password: hashedPassword
    }
  });

  sendTokenResponse(user.id, 200, res);
});

/**
 * @route GET /auth/me
 * @desc Get Current logged in User
 */
//
exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({ success: true, data: req.user });
});

/**
 * @route GET /auth/logout
 * @desc let's the user logout
 */
exports.logout = catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Remove FCM Token
  await prisma.user.update({ where: { id: userId }, data: { fcmToken: null } });

  res.status(200).json({
    success: true,
    message: 'Successfully Logged out'
  });
});

/**
 * @route POST /auth/forgot-password
 * @desc Sends a mail with reset token to the given email address
 */
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    return next(
      new ErrorResponse('No User found with that email address', 404)
    );
  }

  try {
    res.status(200).json({ success: true, message: 'Email Sent' });
  } catch (err) {
    return next(new ErrorResponse('Could not send email', 500));
  }

  try {
    const resetTokens = authUtils.getResetPasswordToken();

    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordToken: resetTokens.resetPasswordToken,
        resetPasswordExpire: new Date(resetTokens.resetPasswordExpire)
      }
    });

    await new Email(user).sendPasswordReset(resetTokens.resetToken);
  } catch (err) {
    next(err);
  }
});

/**
 * @route POST /auth/reset-password/:token
 * @desc Resets a user's password when requested with right reset token
 */
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;

  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // Find The Hashed version
  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken,
      resetPasswordExpire: { gte: new Date() }
    }
  });

  // Token expired or invalid token
  if (!user) {
    return next(
      new ErrorResponse('Invalid token maybe your time expired', 404)
    );
  }

  // Update user with new password
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await authUtils.hashPassword(password),
      resetPasswordToken: null,
      resetPasswordExpire: null
    }
  });

  sendTokenResponse(user.id, 200, res);
});

/**
 * @route POST /auth/update-details
 * @desc Updates user's details
 */
exports.updateDetails = catchAsync(async (req, res) => {
  const { name, phone, email, department, employeeNumber } = req.body;
  const user = req.user;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      phone,
      email,
      department,
      employeeNumber
    }
  });

  res.status(200).json({
    success: true,
    message: 'Profile Updated Successfully'
  });
});

/**
 * @route POST /auth/update-password
 * @desc Updates user's password
 */
exports.updatePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, id: true }
  });

  // Check current password
  if (!(await authUtils.matchPassword(currentPassword, user.password))) {
    return next(new ErrorResponse('Password is incorrect', 401));
  }

  await prisma.user.update({
    where: { id: userId },
    data: { password: await authUtils.hashPassword(newPassword) }
  });

  sendTokenResponse(user.id, 200, res);
});

/**
 * @route POST /auth/update-avatar
 * @desc Updates user's avatar
 */
exports.updateAvatar = catchAsync(async (req, res, next) => {
  const form = formidable();
  const user = req.user;
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
  form.parse(req, async (err, _fields, file) => {
    if (err) {
      return next(err);
    }

    if (file.avatar) {
      moveFromTemp(file);
      const fieldsToUpdate = { avatar: filename };

      await prisma.user.update({
        where: { id: user.id },
        data: fieldsToUpdate
      });
    } else {
      const fieldsToUpdate = { avatar: '' };

      await prisma.user.update({
        where: { id: user.id },
        data: fieldsToUpdate
      });
    }

    // Delete old avatar
    if (user.avatar) {
      try {
        const oldAvatar = path.join(__dirname, '../public/avatar', user.avatar);
        fs.unlinkSync(oldAvatar);
      } catch (err) {
        return next(err);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Avatar updated successfully.'
    });
  });
});

/**
 * @route POST /auth/set-inactive
 * @desc Marks a user account as inactive
 */
exports.markAsInactive = catchAsync(async (req, res, next) => {
  const user = req.user;
  await prisma.user.update({ where: { id: user.id }, data: { active: false } });

  res.status(200).json({
    success: true,
    message: 'Operation done successfully'
  });
});

// Creates a JWT Token and returns it in a cookie
const sendTokenResponse = (userId, statusCode, res) => {
  const token = authUtils.getSignedJwtToken(userId);
  res.status(statusCode).json({ success: true, token });
};
