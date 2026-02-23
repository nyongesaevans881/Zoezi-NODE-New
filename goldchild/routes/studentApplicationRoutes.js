const express = require('express');
const { createGoldchildStudentApplication } = require('../services/studentApplicationService');

const router = express.Router();

const getMissingFields = (payload) => {
  const missing = [];

  if (!payload?.personalInformation?.firstName) missing.push('personalInformation.firstName');
  if (!payload?.personalInformation?.lastName) missing.push('personalInformation.lastName');
  if (!payload?.personalInformation?.email) missing.push('personalInformation.email');
  if (!payload?.personalInformation?.phoneNumber) missing.push('personalInformation.phoneNumber');
  if (!payload?.personalInformation?.dateOfBirth) missing.push('personalInformation.dateOfBirth');
  if (!payload?.personalInformation?.gender) missing.push('personalInformation.gender');
  if (!payload?.personalInformation?.citizenship) missing.push('personalInformation.citizenship');
  if (!payload?.personalInformation?.idOrPassportNumber) missing.push('personalInformation.idOrPassportNumber');

  if (!payload?.academicInformation?.highestQualification) missing.push('academicInformation.highestQualification');
  if (!payload?.academicInformation?.kcseGradeOrEquivalent) missing.push('academicInformation.kcseGradeOrEquivalent');
  if (!payload?.academicInformation?.course) missing.push('academicInformation.course');
  if (!payload?.academicInformation?.preferredIntakeMonth) missing.push('academicInformation.preferredIntakeMonth');
  if (!payload?.academicInformation?.modeOfTraining) missing.push('academicInformation.modeOfTraining');

  if (!Array.isArray(payload?.discoveryChannels) || payload.discoveryChannels.length === 0) {
    missing.push('discoveryChannels');
  }

  if (!payload?.financialInformation?.feePayerName) missing.push('financialInformation.feePayerName');
  if (!payload?.financialInformation?.feePayerPhoneNumber) missing.push('financialInformation.feePayerPhoneNumber');

  if (!payload?.nextOfKin?.fullName) missing.push('nextOfKin.fullName');
  if (!payload?.nextOfKin?.relationship) missing.push('nextOfKin.relationship');
  if (!payload?.nextOfKin?.phoneNumber) missing.push('nextOfKin.phoneNumber');

  if (payload?.declarations?.rulesAccepted !== true) missing.push('declarations.rulesAccepted');

  return missing;
};

router.post('/student', async (req, res) => {
  try {
    const payload = req.body;
    const missingFields = getMissingFields(payload);

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing or invalid required fields.',
        missingFields
      });
    }

    const savedApplication = await createGoldchildStudentApplication(payload);

    return res.status(201).json({
      status: 'success',
      message: 'Goldchild student application submitted successfully.',
      data: {
        id: savedApplication._id,
        applicationNumber: savedApplication.applicationNumber,
        submittedAt: savedApplication.submittedAt
      }
    });
  } catch (error) {
    console.error('Goldchild student application error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to submit Goldchild student application.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
