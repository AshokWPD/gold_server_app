const fs = require('fs');
const path = require('path');
const mv = require('mv');
const formidable = require('formidable');
const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');
const { generateRandomString } = require('../utils/functions');
const sendPushNotification = require('../utils/notification');
const ErrorResponse = require('../utils/errorResponse');

/**
 * @route POST /attendance
 * @desc Create an attendance record
 */
exports.createAttendance = catchAsync(async (req, res, next) => {
  const user = req.user;
  const filesArr = [];
  const randomString = generateRandomString();
  const uploadFolder = path.join('public', `attendance-data/${randomString}`);

  fs.mkdir(uploadFolder, { recursive: true }, (err) => {
    if (err) {
      return next(new ErrorResponse(err, 500));
    }
  });

  const form = new formidable.IncomingForm({
    multiples: true,
    maxFileSize: 1000 * 1024 * 1024, // 100MB
    uploadDir: uploadFolder,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      fs.rm(uploadFolder, { recursive: true, force: true }, (err) => {
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
          fileType: types[i],
        });

        try {
          fs.renameSync(
            file.filepath,
            path.join(uploadFolder, file.originalFilename)
          );
        } catch (error) {
          fs.rm(uploadFolder, { recursive: true, force: true }, (err) => {
            if (err) {
              // Handle error
            }
          });

          return next(new ErrorResponse('Cannot Upload File', 400));
        }

        i++;
      }
    } else {
      // Delete Empty Folder
      fs.rm(uploadFolder, { recursive: true, force: true }, (err) => {
        if (err) {
          // Handle error
        }
      });
    }

    const name = fields.name;
    const userId = fields.userId;
    const dateTime = fields.dateTime;
    const latitude = fields.latitude;
    const longitude = fields.longitude;
    const digitalSign = filesArr[0] ? filesArr[0].name : null;
    const meetId = fields.meetId;
    const endTime = fields.endTime;

    const data = await prisma.attendance.create({
      data: {
        name,
        userId,
        dateTime,
        latitude,
        longitude,
        digitalSign,
        meetId,
        endTime,
        files: { createMany: { data: filesArr } },
      },
    });

    res.status(200).json({
      success: true,
      data,
    });
  });
});
