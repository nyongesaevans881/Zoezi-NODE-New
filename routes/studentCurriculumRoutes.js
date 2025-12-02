const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Group = require('../models/Group')
const User = require('../models/User')

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

// GET /student-curriculum?courseId=... - Get curriculum for student's group in a course
router.get('/', verifyToken, async (req, res) => {
  try {
    const { courseId } = req.query
    if (!courseId) return res.status(400).json({ status: 'error', message: 'courseId required' })

    // Find student's record
    const user = await User.findById(req.userId)
    if (!user) return res.status(404).json({ status: 'error', message: 'Student not found' })

    // Find course enrollment
    const courseEnroll = user.courses.find(c => String(c.courseId) === String(courseId))
    if (!courseEnroll) return res.status(404).json({ status: 'error', message: 'Not enrolled in this course' })

    // Find group student belongs to in this course
    if (!courseEnroll.assignedGroup?.groupId) {
      return res.status(404).json({ status: 'error', message: 'Not assigned to a group yet' })
    }

    const group = await Group.findById(courseEnroll.assignedGroup.groupId)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    // Get tutor info
    const Tutor = require('../models/Tutor')
    const tutor = await Tutor.findById(group.tutorId).select('firstName lastName email phone').lean()

    return res.status(200).json({
      status: 'success',
      data: {
        group,
        tutor,
        courseEnroll
      }
    })
  } catch (err) {
    console.error('Get student curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch curriculum' })
  }
})

// POST /student-curriculum/:groupId/items/:itemId/respond - Student submits response/question
router.post('/:groupId/items/:itemId/respond', verifyToken, async (req, res) => {
  try {
    const { groupId, itemId } = req.params
    const { responseText, attachmentUrl, attachmentType, isQuestion, isPublic } = req.body

    const group = await Group.findById(groupId)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    // Verify student is in this group
    const studentInGroup = group.students.find(s => String(s.studentId) === String(req.userId))
    if (!studentInGroup) return res.status(403).json({ status: 'error', message: 'Not in this group' })

    const item = group.curriculumItems.id(itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })

    // Check if released
    if (item.releaseDate && new Date(`${item.releaseDate}T${item.releaseTime}`) > new Date()) {
      return res.status(403).json({ status: 'error', message: 'Item not yet released' })
    }

    const student = await User.findById(req.userId).select('firstName lastName').lean()
    if (!item.responses) item.responses = []

    item.responses.push({
      studentId: req.userId,
      studentName: `${student.firstName} ${student.lastName}`,
      responseText: responseText || '',
      attachmentUrl: attachmentUrl || '',
      attachmentType: attachmentType || 'none',
      isQuestion: isQuestion || false,
      isPublic: isPublic || false
    })

    await group.save()
    return res.status(201).json({ status: 'success', data: { item } })
  } catch (err) {
    console.error('Submit response error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to submit response' })
  }
})

// PUT /student-curriculum/:groupId/items/:itemId/responses/:responseId - Tutor adds remark
router.put('/:groupId/items/:itemId/responses/:responseId', verifyToken, async (req, res) => {
  try {
    const { groupId, itemId, responseId } = req.params
    const { tutorRemark } = req.body

    const group = await Group.findById(groupId)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    // Verify tutor owns this group
    if (String(group.tutorId) !== String(req.userId) && req.userType !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }

    const item = group.curriculumItems.id(itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })

    const response = item.responses.id(responseId)
    if (!response) return res.status(404).json({ status: 'error', message: 'Response not found' })

    response.tutorRemark = tutorRemark || ''
    response.tutorRemarkAt = new Date()

    await group.save()
    return res.status(200).json({ status: 'success', data: { item } })
  } catch (err) {
    console.error('Add remark error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add remark' })
  }
})

// DELETE /student-curriculum/:groupId/items/:itemId/responses/:responseId - Delete response
router.delete('/:groupId/items/:itemId/responses/:responseId', verifyToken, async (req, res) => {
  try {
    const { groupId, itemId, responseId } = req.params
    const group = await Group.findById(groupId)

    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    const item = group.curriculumItems.id(itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })

    const response = item.responses.id(responseId)
    if (!response) return res.status(404).json({ status: 'error', message: 'Response not found' })

    // Only student who submitted or tutor can delete
    if (String(response.studentId) !== String(req.userId) && String(group.tutorId) !== String(req.userId) && req.userType !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }

    response.deleteOne()
    await group.save()

    return res.status(200).json({ status: 'success', data: { item } })
  } catch (err) {
    console.error('Delete response error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete response' })
  }
})

// POST /student-curriculum/hide-payment-notification - Hide payment widget
router.post('/hide-payment-notification', verifyToken, async (req, res) => {
  try {
    const { courseId } = req.body
    if (!courseId) return res.status(400).json({ status: 'error', message: 'courseId required' })

    const user = await User.findById(req.userId)
    const courseEnroll = user.courses.find(c => String(c.courseId) === String(courseId))
    
    if (!courseEnroll) return res.status(404).json({ status: 'error', message: 'Not enrolled in this course' })

    courseEnroll.paymentNotificationHidden = true
    await user.save()

    return res.status(200).json({ status: 'success', message: 'Notification hidden' })
  } catch (err) {
    console.error('Hide notification error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to hide notification' })
  }
})

module.exports = router
