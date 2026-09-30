const pool = require("../config/db");

exports.getMine = async (req, res) => {
  try {
    const [result] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.markRead = async (req,res) => {
  try {
    const { id } = req.params;

    // only let someone mark THEIR OWN notification as read
    const [check] = await pool.query('SELECT user_id FROM notifications WHERE id = ?', [id]);
    if (check.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    if (check[0].user_id !== req.user.userId) {
      return res.status(403).json({ message: 'This notification does not belong to you' });
    }

    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [id]);
    res.json({ id, is_read: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
exports.createNotification = async (clinic_id, user_id, appointment_id, type, message) => {
  await pool.query(
    'INSERT INTO notifications (clinic_id, user_id, appointment_id, type, message) VALUES (?, ?, ?, ?, ?)',
    [clinic_id, user_id, appointment_id, type, message]
  );
};