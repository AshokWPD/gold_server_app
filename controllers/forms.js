// controllers/form.js
const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');



/**
 * @route POST /form/create
 * @desc Create a new form
 */
exports.createForm = catchAsync(async (req, res, next) => {
  const {
    formTitle,
    formResult,
    username,
    userId,
    dateAndTime,
    description,
    status,
    // Assuming q1, q2, ..., q50 are provided in the request body
    ...providedQuestions
  } = req.body;

  // Fill in missing questions with null
  const allQuestions = Array.from({ length: 50 }, (_, i) => providedQuestions[`q${i + 1}`] || null);

  try {
    const newForm = await prisma.form.create({
      data: {
        formTitle,
        formResult,
        username,
        userId,
        dateAndTime,
        description,
        status,
        // Spread all questions into the data object
        ...Object.fromEntries(allQuestions.map((q, index) => [`q${index + 1}`, q])),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Form created successfully',
      data: newForm,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});





/**
 * @route GET /form/getAll
 * @desc Get all forms
 */
exports.getAllForms = catchAsync(async (req, res, next) => {
  try {
    const forms = await prisma.form.findMany();

    res.status(200).json({
      success: true,
      data: forms,
      message: 'All forms retrieved successfully',
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});



exports.getFormById = catchAsync(async (req, res, next) => {
    const { formId } = req.params;
  
    try {
      const form = await prisma.form.findUnique({
        where: {
          formId: parseInt(formId), // Assuming formId is an integer
        },
      });
  
      if (!form) {
        return res.status(404).json({
          success: false,
          message: 'Form not found',
        });
      }
  
      res.status(200).json({
        success: true,
        data: form,
        message: 'Form retrieved successfully',
      });
    } catch (error) {
      console.error(error);
      next(error);
    }
  });