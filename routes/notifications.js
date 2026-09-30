const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const notificationsController = require('../controllers/notificationsController');

router.get('/', authenticateToken, notificationsController.getMine);
router.patch('/:id/read', authenticateToken, notificationsController.markRead);

module.exports = router;