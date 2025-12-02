const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Group = require('../models/Group')
const Tutor = require('../models/Tutor')
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

// GET /groups?tutorId=... - list groups for a tutor
router.get('/', verifyToken, async (req, res) => {
  try {
    const tutorId = req.query.tutorId || req.userId
    if (req.userType !== 'admin' && String(req.userId) !== String(tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    const groups = await Group.find({ tutorId }).lean()
    return res.status(200).json({ status: 'success', data: { groups } })
  } catch (err) {
    console.error('Get groups error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch groups' })
  }
})

// POST /groups - create group (tutor creates)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, tutorId, courseId } = req.body
    const owner = tutorId || req.userId
    if (req.userType !== 'admin' && String(req.userId) !== String(owner)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    if (!name || !courseId) return res.status(400).json({ status: 'error', message: 'Missing name or courseId' })
    const group = await Group.create({ name, tutorId: owner, courseId, students: [] })
    return res.status(201).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Create group error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to create group' })
  }
})

// PUT /groups/:id - rename/update group
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const { name } = req.body
    const group = await Group.findById(id)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) return res.status(403).json({ status: 'error', message: 'Forbidden' })
    if (name) group.name = name
    await group.save()
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Update group error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to update group' })
  }
})

// DELETE /groups/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const group = await Group.findById(id)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) return res.status(403).json({ status: 'error', message: 'Forbidden' })
    await group.remove()
    return res.status(200).json({ status: 'success', message: 'Group deleted' })
  } catch (err) {
    console.error('Delete group error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete group' })
  }
})

// POST /groups/:id/add-student
router.post('/:id/add-student', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const { studentId, name } = req.body
    if (!studentId) return res.status(400).json({ status: 'error', message: 'Missing studentId' })
    const group = await Group.findById(id)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) return res.status(403).json({ status: 'error', message: 'Forbidden' })
    // Avoid duplicates
    if ((group.students || []).some(s => String(s.studentId) === String(studentId))) return res.status(409).json({ status: 'error', message: 'Student already in group' })
    group.students.push({ studentId, name })
    await group.save()
    
    // Update tracking on Tutor.myStudents
    const tutor = await Tutor.findById(group.tutorId)
    if (tutor && tutor.myStudents) {
      const myStudentEntry = tutor.myStudents.find(s => String(s.studentId) === String(studentId))
      if (myStudentEntry) {
        myStudentEntry.isAssignedToGroup = true
        myStudentEntry.assignedGroup = {
          groupId: group._id,
          groupName: group.name
        }
        await tutor.save()
      }
    }
    
    // Update tracking on User.courses
    const student = await User.findById(studentId)
    if (student && student.courses) {
      const courseEntry = student.courses.find(c => String(c.courseId) === String(group.courseId))
      if (courseEntry) {
        courseEntry.isAssignedToGroup = true
        courseEntry.assignedGroup = {
          groupId: group._id,
          groupName: group.name
        }
        await student.save()
      }
    }
    
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Add student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add student' })
  }
})

// POST /groups/:id/remove-student
router.post('/:id/remove-student', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const { studentId } = req.body
    if (!studentId) return res.status(400).json({ status: 'error', message: 'Missing studentId' })
    const group = await Group.findById(id)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) return res.status(403).json({ status: 'error', message: 'Forbidden' })
    group.students = (group.students || []).filter(s => String(s.studentId) !== String(studentId))
    await group.save()
    
    // Update tracking on Tutor.myStudents
    const tutor = await Tutor.findById(group.tutorId)
    if (tutor && tutor.myStudents) {
      const myStudentEntry = tutor.myStudents.find(s => String(s.studentId) === String(studentId))
      if (myStudentEntry) {
        myStudentEntry.isAssignedToGroup = false
        myStudentEntry.assignedGroup = {
          groupId: null,
          groupName: null
        }
        await tutor.save()
      }
    }
    
    // Update tracking on User.courses
    const student = await User.findById(studentId)
    if (student && student.courses) {
      const courseEntry = student.courses.find(c => String(c.courseId) === String(group.courseId))
      if (courseEntry) {
        courseEntry.isAssignedToGroup = false
        courseEntry.assignedGroup = {
          groupId: null,
          groupName: null
        }
        await student.save()
      }
    }
    
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Remove student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to remove student' })
  }
})

// POST /groups/transfer - transfer student between groups
router.post('/transfer', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { fromGroupId, toGroupId, studentId } = req.body
    if (!fromGroupId || !toGroupId || !studentId) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ status: 'error', message: 'Missing fields' })
    }
    const from = await Group.findById(fromGroupId).session(session)
    const to = await Group.findById(toGroupId).session(session)
    if (!from || !to) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Group not found' })
    }
    if (req.userType !== 'admin' && String(req.userId) !== String(from.tutorId) && String(req.userId) !== String(to.tutorId)) {
      await session.abortTransaction(); session.endSession()
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    const student = (from.students || []).find(s => String(s.studentId) === String(studentId))
    if (!student) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Student not in source group' })
    }
    // Remove from source
    from.students = (from.students || []).filter(s => String(s.studentId) !== String(studentId))
    // Add to destination if not present
    if (!(to.students || []).some(s => String(s.studentId) === String(studentId))) {
      to.students.push({ studentId: student.studentId, name: student.name })
    }
    await from.save({ session })
    await to.save({ session })
    
    // Update tracking on Tutor.myStudents
    const tutor = await Tutor.findById(from.tutorId)
    if (tutor && tutor.myStudents) {
      const myStudentEntry = tutor.myStudents.find(s => String(s.studentId) === String(studentId))
      if (myStudentEntry) {
        myStudentEntry.isAssignedToGroup = true
        myStudentEntry.assignedGroup = {
          groupId: to._id,
          groupName: to.name
        }
        await tutor.save()
      }
    }
    
    // Update tracking on User.courses
    const updatedStudent = await User.findById(studentId)
    if (updatedStudent && updatedStudent.courses) {
      // Update course entry for the transfer
      const courseEntry = updatedStudent.courses.find(c => String(c.courseId) === String(to.courseId))
      if (courseEntry) {
        courseEntry.isAssignedToGroup = true
        courseEntry.assignedGroup = {
          groupId: to._id,
          groupName: to.name
        }
        await updatedStudent.save()
      }
    }
    
    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ status: 'success', message: 'Transferred' })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Transfer error:', err)
    return res.status(500).json({ status: 'error', message: 'Transfer failed' })
  }
})

module.exports = router
