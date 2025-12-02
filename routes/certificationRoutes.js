const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Tutor = require('../models/Tutor')
const Group = require('../models/Group')
const Course = require('../models/Course')

const JWT_SECRET = process.env.JWT_SECRET || 'zoezi_secret'

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

// Grade to GPA conversion
const gradeToGPA = {
  'Distinction': 4.0,
  'Merit': 3.7,
  'Credit': 3.0,
  'Pass': 2.0,
  'Fail': 0.0
}

const calculateGPA = (exams) => {
  if (!exams || exams.length === 0) return 0
  const total = exams.reduce((sum, exam) => sum + (gradeToGPA[exam.grade] || 0), 0)
  return (total / exams.length).toFixed(2)
}

// GET /certification/students?groupId=... - Get all students in groups for tutor
router.get('/students', verifyToken, async (req, res) => {
  try {
    const { groupId } = req.query

    // Get groups for this tutor
    let groups
    if (groupId) {
      const group = await Group.findById(groupId).populate('students.studentId', 'firstName lastName email phone idNumber')
      if (!group || String(group.tutorId) !== String(req.userId)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden' })
      }
      groups = [group]
    } else {
      groups = await Group.find({ tutorId: req.userId }).populate('students.studentId', 'firstName lastName email phone idNumber courses')
    }

    // Enrich student data with course completion and payment info
    const enrichedGroups = await Promise.all(
      groups.map(async (group) => {
        const students = await Promise.all(
          group.students.map(async (enrollment) => {
            const student = enrollment.studentId
            if (!student) return null

            // Find the course enrollment for this student
            const courseEnroll = student.courses?.find(c => String(c.courseId) === String(group.courseId))
            
            // Calculate completion percentage
            const completedItems = group.curriculumItems.filter(item => item.isCompleted).length
            const totalItems = group.curriculumItems.length
            const completionPercentage = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100)

            return {
              studentId: student._id,
              studentName: `${student.firstName} ${student.lastName}`,
              email: student.email,
              phone: student.phone,
              idNumber: student.idNumber,
              completionPercentage,
              completedItems,
              totalItems,
              paymentStatus: courseEnroll?.payment?.status || 'PENDING',
              exams: courseEnroll?.exams || [],
              gpa: courseEnroll?.gpa || 0,
              finalGrade: courseEnroll?.finalGrade || '',
              certificationStatus: courseEnroll?.certificationStatus || 'PENDING'
            }
          })
        )
        return {
          groupId: group._id,
          groupName: group.name,
          courseId: group.courseId,
          courseName: group.courseName,
          students: students.filter(s => s !== null)
        }
      })
    )

    return res.status(200).json({ status: 'success', data: { groups: enrichedGroups } })
  } catch (err) {
    console.error('Get students error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch students' })
  }
})

// POST /certification/:studentId/:courseId/exam - Add exam record
router.post('/:studentId/:courseId/exam', verifyToken, async (req, res) => {
  try {
    const { studentId, courseId } = req.params
    const { examName, grade } = req.body

    if (!examName || !grade) {
      return res.status(400).json({ status: 'error', message: 'Exam name and grade required' })
    }

    const student = await User.findById(studentId)
    if (!student) return res.status(404).json({ status: 'error', message: 'Student not found' })

    const courseEnroll = student.courses.find(c => String(c.courseId) === String(courseId))
    if (!courseEnroll) return res.status(404).json({ status: 'error', message: 'Course enrollment not found' })

    // Add exam
    courseEnroll.exams.push({ examName, grade })

    // Recalculate GPA and final grade
    courseEnroll.gpa = calculateGPA(courseEnroll.exams)
    courseEnroll.finalGrade = courseEnroll.exams.length > 0 ? courseEnroll.exams[courseEnroll.exams.length - 1].grade : ''

    await student.save()

    return res.status(201).json({
      status: 'success',
      data: {
        exams: courseEnroll.exams,
        gpa: courseEnroll.gpa,
        finalGrade: courseEnroll.finalGrade
      }
    })
  } catch (err) {
    console.error('Add exam error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add exam' })
  }
})

// DELETE /certification/:studentId/:courseId/exam/:examId - Delete exam
router.delete('/:studentId/:courseId/exam/:examId', verifyToken, async (req, res) => {
  try {
    const { studentId, courseId, examId } = req.params

    const student = await User.findById(studentId)
    if (!student) return res.status(404).json({ status: 'error', message: 'Student not found' })

    const courseEnroll = student.courses.find(c => String(c.courseId) === String(courseId))
    if (!courseEnroll) return res.status(404).json({ status: 'error', message: 'Course enrollment not found' })

    // Remove exam
    const examIndex = courseEnroll.exams.findIndex(e => String(e._id) === String(examId))
    if (examIndex === -1) return res.status(404).json({ status: 'error', message: 'Exam not found' })

    courseEnroll.exams.splice(examIndex, 1)

    // Recalculate GPA and final grade
    courseEnroll.gpa = calculateGPA(courseEnroll.exams)
    courseEnroll.finalGrade = courseEnroll.exams.length > 0 ? courseEnroll.exams[courseEnroll.exams.length - 1].grade : ''

    await student.save()

    return res.status(200).json({
      status: 'success',
      data: {
        exams: courseEnroll.exams,
        gpa: courseEnroll.gpa,
        finalGrade: courseEnroll.finalGrade
      }
    })
  } catch (err) {
    console.error('Delete exam error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete exam' })
  }
})

// POST /certification/:studentId/:courseId/graduate - Graduate student
router.post('/:studentId/:courseId/graduate', verifyToken, async (req, res) => {
  try {
    const { studentId, courseId } = req.params
    const { groupId } = req.body
    console.log("Graduate request params:", { studentId, courseId, groupId })
    const tutor = await Tutor.findById(req.userId)
    const student = await User.findById(studentId)
    const group = await Group.findById(groupId)

    if (!tutor) return res.status(404).json({ status: 'error', message: 'Tutor not found' })
    if (!student) return res.status(404).json({ status: 'error', message: 'Student not found' })
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    const courseEnroll = student.courses.find(c => String(c.courseId) === String(courseId))
    if (!courseEnroll) return res.status(404).json({ status: 'error', message: 'Course enrollment not found' })

    // VALIDATION CHECKLIST
    // 1. Check 100% completion
    const completedItems = group.curriculumItems.filter(item => item.isCompleted).length
    const totalItems = group.curriculumItems.length
    if (completedItems !== totalItems) {
      return res.status(400).json({ 
        status: 'error', 
        message: `Course not 100% complete. ${completedItems}/${totalItems} items completed.` 
      })
    }

    // 2. Check payment
    if (courseEnroll.payment.status !== 'PAID') {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Payment not complete. Status: ' + courseEnroll.payment.status 
      })
    }

    // 3. Check exams exist
    if (!courseEnroll.exams || courseEnroll.exams.length === 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'No exam records found. Add at least one exam before graduation.' 
      })
    }

    // 4. Check no Fail grade
    if (courseEnroll.exams.some(e => e.grade === 'Fail')) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Student has Fail grade(s). Cannot graduate.' 
      })
    }

    // All checks passed - Graduate student
    courseEnroll.certificationStatus = 'GRADUATED'
    courseEnroll.certificationDate = new Date()

    await student.save()

    // Add to tutor's certified students
    tutor.certifiedStudents.push({
      studentId: student._id,
      studentName: `${student.firstName} ${student.lastName}`,
      email: student.email,
      phone: student.phone,
      courseId,
      courseName: courseEnroll.name,
      payment: {
        status: courseEnroll.payment.status,
        amount: courseEnroll.payment.amount,
        phone: courseEnroll.payment.phone,
        transactionId: courseEnroll.payment.transactionId,
        timeOfPayment: courseEnroll.payment.timeOfPayment
      },
      exams: courseEnroll.exams,
      gpa: courseEnroll.gpa,
      finalGrade: courseEnroll.finalGrade,
      certificationDate: courseEnroll.certificationDate
    })

    // Remove from myStudents
    tutor.myStudents = tutor.myStudents.filter(s => !(String(s.studentId) === String(studentId) && String(s.courseId) === String(courseId)))

    // Remove from group
    group.students = group.students.filter(s => String(s.studentId) !== String(studentId))

    // Update course enrolled students
    const course = await Course.findById(courseId)
    if (course && course.enrolledStudents) {
      course.enrolledStudents = course.enrolledStudents.filter(s => String(s.studentId) !== String(studentId))
    }

    await Promise.all([tutor.save(), group.save(), course.save()])

    return res.status(200).json({
      status: 'success',
      message: 'Student graduated successfully',
      data: { certificationDate: courseEnroll.certificationDate }
    })
  } catch (err) {
    console.error('Graduate student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to graduate student' })
  }
})

module.exports = router
