const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Alumni = require('../models/Alumni');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Multer in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'students_profile_pictures') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// GET /students - list students with optional pagination and search
router.get('/', async (req, res) => {
  try {
    const { limit = 50, skip = 0, search } = req.query;
    const q = {};
    if (search) {
      const re = new RegExp(search, 'i');
      q.$or = [{ firstName: re }, { lastName: re }, { email: re }, { phone: re }];
    }

    const total = await Student.countDocuments(q);
    const students = await Student.find(q)
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ createdAt: -1 })
      .select('-password'); // Return ALL fields except password

    res.status(200).json({ status: 'success', data: { students, pagination: { total, limit: parseInt(limit), skip: parseInt(skip) } } });
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch students', error: err.message });
  }
});

// PUT /students/:studentId/update-upfront-fee - Update student upfrontFee (paid amount)
router.put('/:studentId/update-upfront-fee', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { upfrontFee } = req.body;

    if (upfrontFee === undefined || isNaN(upfrontFee) || upfrontFee < 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid upfront fee amount' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    // Ensure upfront fee does not exceed course fee
    if (parseFloat(upfrontFee) > (student.courseFee || 0)) {
      return res.status(400).json({ status: 'error', message: 'Upfront fee cannot exceed course fee' });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { upfrontFee: parseFloat(upfrontFee) },
      { new: true }
    ).select('-password');

    res.status(200).json({ status: 'success', message: 'Upfront fee updated successfully', data: updatedStudent });
  } catch (err) {
    console.error('Update upfront fee error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update upfront fee', error: err.message });
  }
});

// PUT /students/:studentId/update-exam-grades - Update exam grades for a student
router.put('/:studentId/update-exam-grades', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { examGrades } = req.body; // Array of { examIndex, score }

    if (!Array.isArray(examGrades) || examGrades.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid exam grades data' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    // Update each exam grade
    examGrades.forEach((gradeItem) => {
      const { examIndex, score } = gradeItem;
      if (student.exams[examIndex]) {
        student.exams[examIndex].score = score;
      }
    });

    await student.save();

    res.status(200).json({ status: 'success', message: 'Exam grades updated successfully', data: student });
  } catch (err) {
    console.error('Update exam grades error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update exam grades', error: err.message });
  }
});

// POST /students/:studentId/graduate - Graduate a student (transfer to Alumni, delete from Students)
router.post('/:studentId/graduate', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId).session(session);
    if (!student) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    // Check fee completion
    if ((student.upfrontFee || 0) < (student.courseFee || 0)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'Student fees not fully paid' });
    }

    // Check all exams have grades
    if (!student.exams || student.exams.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'No exams found for student' });
    }

    const allGradesComplete = student.exams.every(exam => exam.score && exam.score !== null);
    if (!allGradesComplete) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'Not all exam grades are entered' });
    }

    // Create alumni record with all student data
    const alumniData = {
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      phone: student.phone,
      password: student.password,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      admissionNumber: student.admissionNumber,
      applicationRef: student.applicationRef,
      qualification: student.qualification,
      course: student.course,
      trainingMode: student.trainingMode,
      preferredIntake: student.preferredIntake,
      preferredStartDate: student.preferredStartDate,
      startDate: student.startDate,
      citizenship: student.citizenship,
      idNumber: student.idNumber,
      kcseGrade: student.kcseGrade,
      howHeardAbout: student.howHeardAbout,
      otherSource: student.otherSource,
      courseFee: student.courseFee,
      upfrontFee: student.upfrontFee,
      feePayer: student.feePayer,
      feePayerPhone: student.feePayerPhone,
      nextOfKinName: student.nextOfKinName,
      nextOfKinRelationship: student.nextOfKinRelationship,
      nextOfKinPhone: student.nextOfKinPhone,
      courseDuration: student.courseDuration,
      exams: student.exams,
      profilePicture: student.profilePicture,
      status: 'alumni',
      graduationDate: new Date()
    };

    const alumnus = new Alumni(alumniData);
    await alumnus.save({ session });

    // Delete student from Students collection
    await Student.findByIdAndDelete(studentId, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: 'success',
      message: 'Student graduated successfully',
      data: { alumniId: alumnus._id, admissionNumber: alumnus.admissionNumber }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Graduation error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to graduate student', error: err.message });
  }
});

// PUT /students/:studentId/update - Update student information by section or upload profile picture
router.put('/:studentId/update', upload.single('file'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { section, data } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    // Handle profile picture upload
    if (section === 'profile' && req.file) {
      // Delete old profile picture if exists
      if (student.profilePicPublicId) {
        try {
          await cloudinary.uploader.destroy(student.profilePicPublicId);
        } catch (deleteError) {
          console.error('Error deleting old profile image:', deleteError);
          // Continue with upload even if deletion fails
        }
      }

      // Upload new picture
      const imageData = await uploadToCloudinary(req.file.buffer);

      const updatedStudent = await Student.findByIdAndUpdate(
        studentId,
        {
          profilePicture: imageData.secure_url,
          profilePicPublicId: imageData.public_id
        },
        { new: true }
      ).select('-password');

      return res.status(200).json({
        status: 'success',
        message: 'Profile picture updated successfully',
        data: updatedStudent
      });
    }

    // Handle other sections (personal, contact, academic, financial, exams)
    if (!section || !data) {
      return res.status(400).json({ status: 'error', message: 'Section and data are required' });
    }

    let updateData = {};

    switch (section) {
      case 'personal':
        updateData = {
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender
        };
        break;
      case 'contact':
        updateData = {
          email: data.email,
          phone: data.phone
        };
        break;
      case 'academic':
        updateData = {
          qualification: data.qualification,
          course: data.course,
          trainingMode: data.trainingMode,
          courseDuration: data.courseDuration
        };
        break;
      case 'financial':
        updateData = {
          courseFee: data.courseFee,
          upfrontFee: data.upfrontFee
        };
        break;
      case 'exams':
        updateData = {
          exams: data.exams
        };
        break;
      default:
        return res.status(400).json({ status: 'error', message: 'Invalid section' });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      updateData,
      { new: true }
    ).select('-password');

    res.status(200).json({
      status: 'success',
      message: `${section} information updated successfully`,
      data: updatedStudent
    });
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update student', error: err.message });
  }
});

// GET /students/dashboard/stats - Get comprehensive dashboard statistics
router.get('/dashboard/stats', async (req, res) => {
  try {
    const Application = require('../models/Application');

    // Count applications by status
    const applicationStats = await Application.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalApplications = await Application.countDocuments();
    const pendingApps = await Application.countDocuments({ status: 'pending' });
    const acceptedApps = await Application.countDocuments({ status: 'accepted' });
    const rejectedApps = await Application.countDocuments({ status: 'rejected' });

    // Student statistics
    const totalStudents = await Student.countDocuments();
    const totalFeeCollected = await Student.aggregate([
      { $group: { _id: null, total: { $sum: '$upfrontFee' } } }
    ]);

    const feeCollected = totalFeeCollected.length > 0 ? totalFeeCollected[0].total : 0;

    // Course breakdown
    const courseStats = await Student.aggregate([
      {
        $group: {
          _id: '$course',
          count: { $sum: 1 },
          totalFee: { $sum: '$courseFee' },
          totalPaid: { $sum: '$upfrontFee' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Gender breakdown
    const genderStats = await Student.aggregate([
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 }
        }
      }
    ]);

    // Training mode breakdown
    const trainingModeStats = await Student.aggregate([
      {
        $group: {
          _id: '$trainingMode',
          count: { $sum: 1 }
        }
      }
    ]);

    // Alumni statistics
    const Alumni = require('../models/Alumni');
    const totalAlumni = await Alumni.countDocuments();

    // Fee completion percentage
    const studentsWithAllFees = await Student.countDocuments({
      $expr: { $gte: ['$upfrontFee', '$courseFee'] }
    });
    const feeCompletionPercent = totalStudents > 0 ? Math.round((studentsWithAllFees / totalStudents) * 100) : 0;

    res.status(200).json({
      status: 'success',
      data: {
        applications: {
          total: totalApplications,
          pending: pendingApps,
          accepted: acceptedApps,
          rejected: rejectedApps
        },
        students: {
          total: totalStudents,
          feeCollected,
          feeCompletionPercent,
          byGender: genderStats,
          byTrainingMode: trainingModeStats,
          byCourse: courseStats
        },
        alumni: {
          total: totalAlumni
        },
        conversionRate: totalApplications > 0 ? Math.round((acceptedApps / totalApplications) * 100) : 0
      }
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch dashboard stats', error: err.message });
  }
});

// GET /students/public/all - Get all public profiles (students + alumni)
router.get('/public/all', async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    
    // Fetch all students with public profile enabled
    const students = await Student.find({ isPublicProfileEnabled: true })
      .select('-password')
      .lean();

    // Fetch all alumni with public profile enabled AND paid subscription for current year
    const Alumni = require('../models/Alumni');
    const alumni = await Alumni.find({ 
      isPublicProfileEnabled: true,
      'subscriptionPayments': {
        $elemMatch: {
          year: currentYear,
          status: 'paid'
        }
      }
    })
      .select('-password')
      .lean();

    // Combine and sort: verified (certified professionals) first, then students
    const allProfiles = [...students, ...alumni]
      .sort((a, b) => {
        // Verified/certified professionals first
        if (a.verified && !b.verified) return -1;
        if (!a.verified && b.verified) return 1;
        return 0;
      });

    res.status(200).json({
      status: 'success',
      data: {
        profiles: allProfiles,
        total: allProfiles.length
      }
    });
  } catch (err) {
    console.error('Public profiles error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch public profiles', error: err.message });
  }
});

// GET /students/public/search - Search public profiles
router.get('/public/search', async (req, res) => {
  try {
    const { q } = req.query;
    const currentYear = new Date().getFullYear();

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ status: 'error', message: 'Search query too short' });
    }

    const searchRegex = new RegExp(q, 'i');
    const Alumni = require('../models/Alumni');

    // Search students
    const students = await Student.find({
      isPublicProfileEnabled: true,
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { admissionNumber: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ]
    })
      .select('-password')
      .lean();

    // Search alumni with paid subscription for current year
    const alumni = await Alumni.find({
      isPublicProfileEnabled: true,
      'subscriptionPayments': {
        $elemMatch: {
          year: currentYear,
          status: 'paid'
        }
      },
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { admissionNumber: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ]
    })
      .select('-password')
      .lean();

    // Combine and sort: verified (certified professionals) first, then students
    const results = [...students, ...alumni]
      .sort((a, b) => {
        // Verified/certified professionals first
        if (a.verified && !b.verified) return -1;
        if (!a.verified && b.verified) return 1;
        return 0;
      });

    res.status(200).json({
      status: 'success',
      data: {
        results,
        count: results.length
      }
    });
  } catch (err) {
    console.error('Public search error:', err);
    res.status(500).json({ status: 'error', message: 'Search failed', error: err.message });
  }
});

// PUT /students/:studentId/public-profile - Update student's public profile info (verified, practiceStatus, currentLocation, etc.)
router.put('/:studentId/public-profile', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { practiceStatus, currentLocation, practicingSince, isPublicProfileEnabled } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    const updateData = {};

    if (practiceStatus) {
      if (!['active', 'inactive', 'on_leave'].includes(practiceStatus)) {
        return res.status(400).json({ status: 'error', message: 'Invalid practice status' });
      }
      updateData.practiceStatus = practiceStatus;
    }

    if (currentLocation !== undefined) {
      updateData.currentLocation = currentLocation;
    }

    if (practicingSince !== undefined) {
      updateData.practicingSince = practicingSince ? new Date(practicingSince) : null;
    }

    if (isPublicProfileEnabled !== undefined) {
      updateData.isPublicProfileEnabled = isPublicProfileEnabled;
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      updateData,
      { new: true }
    ).select('-password');

    res.status(200).json({
      status: 'success',
      message: 'Public profile updated successfully',
      data: updatedStudent
    });
  } catch (err) {
    console.error('Update public profile error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update public profile', error: err.message });
  }
});

module.exports = router;
