// routes/form.js
const express = require('express');
const router = express.Router();
const formController = require('../controllers/forms');

// Create a form
router.post('/createForm', formController.createForm);

// Get all forms
router.get('/getAllForm', formController.getAllForms);

// GET form by formId
router.get('/Getform/:formId', formController.getFormById);


module.exports = router;