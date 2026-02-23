const express = require('express');

const router = express.Router();

router.use('/api/applications', require('./studentApplicationRoutes'));
router.use('/applications', require('./studentApplicationRoutes'));

router.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Goldchild server is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
