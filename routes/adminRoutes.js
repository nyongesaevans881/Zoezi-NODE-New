const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Course = require('../models/Course')
const Tutor = require('../models/Tutor')


// GET /admin/assignments - returns courses with enrolledStudents and tutors
router.get('/assignments', async (req, res) => {
  try {
    const courses = await Course.find({}).select('name enrolledStudents').lean()
    const tutors = await Tutor.find({}).select('firstName lastName email phone myStudents').lean()

    // Add counts to tutors
    const tutorsWithCount = tutors.map(t => ({
      _id: t._id,
      name: `${t.firstName} ${t.lastName}`,
      email: t.email,
      phone: t.phone,
      assignedCount: (t.myStudents || []).length
    }))

    return res.status(200).json({ status: 'success', data: { courses, tutors: tutorsWithCount } })
  } catch (err) {
    console.error('Admin assignments fetch error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch assignments' })
  }
})

// POST /admin/assign - assign a student to a tutor
router.post('/assign', async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { tutorId, courseId, studentId } = req.body
    if (!tutorId || !courseId || !studentId) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ status: 'error', message: 'Missing required fields' })
    }

    const tutor = await Tutor.findById(tutorId).session(session)
    const course = await Course.findById(courseId).session(session)
    const user = await User.findById(studentId).session(session)
    if (!tutor || !course || !user) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Tutor, Course or User not found' })
    }

    // Update user.courses entry for this course
    const userCourse = (user.courses || []).find(sc => String(sc.courseId) === String(courseId))
    if (!userCourse) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'User not enrolled in the specified course' })
    }

    userCourse.assignmentStatus = 'ASSIGNED'
    userCourse.tutor = {
      id: tutor._id,
      name: `${tutor.firstName} ${tutor.lastName}`,
      email: tutor.email,
      phone: tutor.phone,
      status: 'ASSIGNED'
    }
    await user.save({ session })

    // Update course enrolledStudents entry
    const stu = (course.enrolledStudents || []).find(es => String(es.studentId) === String(studentId))
    if (stu) {
      stu.assignmentStatus = 'ASSIGNED'
      stu.tutor = {
        id: tutor._id,
        name: `${tutor.firstName} ${tutor.lastName}`,
        email: tutor.email,
        phone: tutor.phone,
        status: 'ASSIGNED'
      }
    }
    await course.save({ session })

    // Add to tutor.myStudents
    tutor.myStudents = tutor.myStudents || []
    tutor.myStudents.push({
      studentId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      courseId: course._id,
      courseName: course.name,
      paymentStatus: (stu && stu.payment && stu.payment.status) || 'PENDING',
      assignedAt: new Date()
    })
    await tutor.save({ session })

    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ status: 'success', message: 'Student assigned to tutor' })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Assign student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to assign student' })
  }
})

// POST /admin/cancel - cancel a student's enrollment/assignment with admin note
router.post('/cancel', async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { courseId, studentId, reason } = req.body
    if (!courseId || !studentId || !reason) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ status: 'error', message: 'Missing required fields' })
    }

    const course = await Course.findById(courseId).session(session)
    const user = await User.findById(studentId).session(session)
    if (!course || !user) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Course or User not found' })
    }

    // Update user.courses entry
    const userCourse = (user.courses || []).find(sc => String(sc.courseId) === String(courseId))
    if (!userCourse) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'User not enrolled in the specified course' })
    }
    userCourse.assignmentStatus = 'CANCELLED'
    userCourse.tutor = userCourse.tutor || {}
    userCourse.tutor.status = 'CANCELLED'
    userCourse.adminNotes = reason
    await user.save({ session })

    // Update course enrolledStudents entry
    const stu = (course.enrolledStudents || []).find(es => String(es.studentId) === String(studentId))
    if (stu) {
      stu.assignmentStatus = 'CANCELLED'
      stu.tutor = stu.tutor || {}
      stu.tutor.status = 'CANCELLED'
      stu.adminNotes = reason
    }
    await course.save({ session })

    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ status: 'success', message: 'Student cancelled with note' })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Cancel student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to cancel student' })
  }
})

module.exports = router
