const { connectGoldchildDB } = require('../config/db');
const { getGoldchildStudentApplicationModel } = require('../models/GoldchildStudentApplication');

const createGoldchildStudentApplication = async (payload) => {
  const connection = await connectGoldchildDB();
  const GoldchildStudentApplication = getGoldchildStudentApplicationModel(connection);

  const application = new GoldchildStudentApplication(payload);
  const savedApplication = await application.save();

  return savedApplication;
};

module.exports = {
  createGoldchildStudentApplication
};
