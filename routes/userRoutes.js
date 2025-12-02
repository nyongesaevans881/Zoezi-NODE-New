const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Course = require('../models/Course')
const MpesaTransaction = require('../models/Mpesa')
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Tutor = require('../models/Tutor');
const Alumni = require('../models/Alumni');


const JWT_SECRET = process.env.JWT_SECRET || 'zoezi_secret'

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Multer in-memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Cloudinary upload utility
const uploadToCloudinary = (fileBuffer, folder = 'profile_pictures') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' },
          { format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// DELETE from Cloudinary utility
const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    // Don't throw error - we don't want to fail the request if Cloudinary deletion fails
  }
};


// Simple auth middleware
function verifyToken(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ status: 'error', message: 'Missing token' })
  const token = auth.split(' ')[1]
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.id
    req.userType = payload.type
    next()
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' })
  }
}

// GET /users/profile - get current user's profile data
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' })

    return res.status(200).json({
      status: 'success',
      data: user
    })
  } catch (err) {
    console.error('Get profile error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch profile' })
  }
})

// GET /users/:id/courses - get user's enrolled courses
router.get('/:id/courses', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    if (req.userId !== id) return res.status(403).json({ status: 'error', message: 'Forbidden' })
    const user = await User.findById(id).select('courses')
      .populate('courses.courseId', 'coverImage description duration durationType');
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' })
    return res.status(200).json({ status: 'success', data: user.courses })
  } catch (err) {
    console.error('Get user courses error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch courses' })
  }
})

// POST /users/enroll - enroll user in course (expects userId, courseId, payment)
router.post('/enroll', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    // Accept either `paymentData` (frontend) or legacy `payment` body key
    const { userId, courseId } = req.body
    const paymentData = req.body.paymentData || req.body.payment || {}
    console.log("Enroll request body:", { userId, courseId, paymentData })

    // Ensure token user matches provided user or allow admins (not implemented)
    if (req.userId !== userId) {
      await session.abortTransaction(); session.endSession()
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }

    const user = await User.findById(userId).session(session)
    const course = await Course.findById(courseId).session(session)
    if (!user || !course) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'User or Course not found' })
    }

    // Check already enrolled
    const already = user.courses?.some(c => String(c.courseId) === String(courseId))
    if (already) {
      await session.abortTransaction(); session.endSession()
      return res.status(409).json({ status: 'error', message: 'Already enrolled' })
    }

    // Determine payment status: if transactionId exists => PAID, otherwise FAILED
    const paymentStatus = paymentData?.transactionId ? 'PAID' : (paymentData?.status || 'FAILED')

    const enrollment = {
      courseId: course._id,
      name: course.name,
      duration: course.duration,
      durationType: course.durationType,
      payment: {
        status: paymentStatus,
        phone: paymentData?.phone || null,
        transactionId: paymentData?.transactionId || null,
        amount: paymentData?.amount || null,
        timeOfPayment: paymentData?.timeOfPayment ? new Date(paymentData.timeOfPayment) : (paymentData?.timeOfPayment ? new Date(paymentData.timeOfPayment) : null)
      },
      enrolledAt: new Date(),
      assignmentStatus: 'PENDING',
      tutor: null
    }

    user.courses = user.courses || []
    user.courses.push(enrollment)
    await user.save({ session })

    // Update course enrolledStudents
    const studentRecord = {
      studentId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      enrollmentTime: enrollment.enrolledAt,
      payment: {
        status: enrollment.payment.status,
        phone: enrollment.payment.phone,
        transactionId: enrollment.payment.transactionId,
        amount: enrollment.payment.amount || null,
        timeOfPayment: enrollment.payment.timeOfPayment || null
      },
      assignmentStatus: enrollment.assignmentStatus || 'PENDING',
      tutor: null
    }

    course.enrolledStudents = course.enrolledStudents || []
    course.enrolledStudents.push(studentRecord)
    await course.save({ session })

    await session.commitTransaction(); session.endSession()

    // After successful commit, if there is a transactionId, mark the Mpesa transaction
    try {
      if (enrollment.payment.transactionId) {
        await MpesaTransaction.findOneAndUpdate(
          { transactionId: String(enrollment.payment.transactionId) },
          {
            purpose: 'course_purchase',
            purposeMeta: { userId: String(userId), courseId: String(courseId) },
            used: true
          },
          { new: true }
        )
      }
    } catch (txErr) {
      console.warn('Could not mark Mpesa transaction purpose:', txErr)
    }

    // Populate returned enrollment with expected frontend fields
    const populatedEnrollment = {
      ...enrollment,
      courseId: enrollment.courseId,
      name: enrollment.name,
      duration: enrollment.duration,
      durationType: enrollment.durationType,
      payment: enrollment.payment,
      enrolledAt: enrollment.enrolledAt,
      assignmentStatus: enrollment.assignmentStatus,
      tutor: enrollment.tutor,
    }

    return res.status(201).json({ status: 'success', data: { enrollment: populatedEnrollment } })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Enroll error:', err)
    return res.status(500).json({ status: 'error', message: 'Enrollment failed' })
  }
})

// PUT /users/:id/profile - Update user profile information
router.put('/:id/profile', verifyToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const {
      currentLocation,
      nextOfKinName,
      nextOfKinRelationship,
      nextOfKinPhone,
      isActive,
      isPublicProfileEnabled,
      userType
    } = req.body;

    // Verify user owns this profile or is admin
    if (req.userId !== id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden'
      });
    }

    let user = null;
    let model = null;

    // Determine which model to use based on userType
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    user = await model.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update profile fields
    const updateData = {};

    // Location field (different field names in different models)
    if (currentLocation !== undefined) {
      if (userType === 'student' || userType === 'alumni') {
        updateData.currentLocation = currentLocation;
      } else if (userType === 'tutor') {
        // Tutors might not have location field, adjust as needed
        updateData.currentLocation = currentLocation;
      }
    }

    // Emergency contact fields
    if (nextOfKinName !== undefined) updateData.nextOfKinName = nextOfKinName;
    if (nextOfKinRelationship !== undefined) updateData.nextOfKinRelationship = nextOfKinRelationship;
    if (nextOfKinPhone !== undefined) updateData.nextOfKinPhone = nextOfKinPhone;

    // Account settings
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isPublicProfileEnabled !== undefined) updateData.isPublicProfileEnabled = isPublicProfileEnabled;

    // Update user
    const updatedUser = await model.findByIdAndUpdate(
      id,
      updateData,
      { new: true, session }
    ).select('-password');

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: updatedUser
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Update profile error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update profile'
    });
  }
});

// POST /users/:id/profile-picture - Upload profile picture
router.post('/:id/profile-picture', verifyToken, upload.single('profilePicture'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { userType } = req.body;

    // Verify user owns this profile or is admin
    if (req.userId !== id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden'
      });
    }

    if (!req.file) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'No image file provided'
      });
    }

    let user = null;
    let model = null;

    // Determine which model to use based on userType
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    user = await model.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Delete old profile picture from Cloudinary if exists
    if (user.profilePicture && user.profilePicture.cloudinaryId) {
      await deleteFromCloudinary(user.profilePicture.cloudinaryId);
    }

    // Upload new picture to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer);

    // Update user with new profile picture
    const profilePictureData = {
      url: uploadResult.secure_url,
      cloudinaryId: uploadResult.public_id
    };

    const updatedUser = await model.findByIdAndUpdate(
      id,
      { profilePicture: profilePictureData },
      { new: true, session }
    ).select('-password');

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 'success',
      message: 'Profile picture updated successfully',
      data: {
        profilePicture: updatedUser.profilePicture
      }
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Profile picture upload error:', err);

    if (err.message === 'Only image files are allowed') {
      return res.status(400).json({
        status: 'error',
        message: 'Only image files are allowed'
      });
    }

    if (err.message && err.message.includes('File too large')) {
      return res.status(400).json({
        status: 'error',
        message: 'File size must be less than 5MB'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Failed to upload profile picture'
    });
  }
});

// DELETE /users/:id/profile-picture - Remove profile picture
router.delete('/:id/profile-picture', verifyToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { userType } = req.body;

    // Verify user owns this profile or is admin
    if (req.userId !== id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden'
      });
    }

    let user = null;
    let model = null;

    // Determine which model to use based on userType
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    user = await model.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Delete profile picture from Cloudinary if exists
    if (user.profilePicture && user.profilePicture.cloudinaryId) {
      await deleteFromCloudinary(user.profilePicture.cloudinaryId);
    }

    // Remove profile picture from user
    const updatedUser = await model.findByIdAndUpdate(
      id,
      {
        profilePicture: {
          url: null,
          cloudinaryId: null
        }
      },
      { new: true, session }
    ).select('-password');

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 'success',
      message: 'Profile picture removed successfully',
      data: {
        profilePicture: updatedUser.profilePicture
      }
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Remove profile picture error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to remove profile picture'
    });
  }
});

module.exports = router
