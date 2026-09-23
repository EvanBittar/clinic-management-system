const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const departmentsController = require('../controllers/departmentsController');
const { body } = require('express-validator');

router.post('/',
    authenticateToken,
    authorizeRoles('manager'), [
    body('name').trim().notEmpty().withMessage('Name is required')
],
    departmentsController.create
);

router.get('/', authenticateToken, departmentsController.getAll);


module.exports = router;