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

router.put('/:id', authenticateToken, authorizeRoles('super_admin','manager', 'deputy_manager'),
    [
        body('name').isString().trim().notEmpty().withMessage('Department name cannot be empty')
    ],
    departmentsController.update
);

module.exports = router;