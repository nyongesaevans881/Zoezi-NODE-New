const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Curriculum = require('../models/Curriculum')
const Tutor = require('../models/Tutor')
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

// GET /curriculums?tutorId=... - list curriculums for a tutor
router.get('/', verifyToken, async (req, res) => {
  try {
    const tutorId = req.query.tutorId || req.userId
    if (req.userType !== 'admin' && String(req.userId) !== String(tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    const curriculums = await Curriculum.find({ tutorId }).lean()
    return res.status(200).json({ status: 'success', data: { curriculums } })
  } catch (err) {
    console.error('Get curriculums error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch curriculums' })
  }
})

// GET /curriculums/:id - get single curriculum with items
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const curriculum = await Curriculum.findById(req.params.id)
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(curriculum.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    return res.status(200).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Get curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch curriculum' })
  }
})

// POST /curriculums - create curriculum for a course
router.post('/', verifyToken, async (req, res) => {
  try {
    const { tutorId, courseId } = req.body
    const owner = tutorId || req.userId
    
    if (req.userType !== 'admin' && String(req.userId) !== String(owner)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    if (!courseId) return res.status(400).json({ status: 'error', message: 'Missing courseId' })
    
    // Check if curriculum already exists for this course
    const existing = await Curriculum.findOne({ tutorId: owner, courseId })
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'Curriculum already exists for this course' })
    }
    
    // Get course name
    const course = await Course.findById(courseId).lean()
    const courseName = course?.name || 'Unknown Course'
    
    const curriculum = await Curriculum.create({
      tutorId: owner,
      courseId,
      courseName,
      items: []
    })
    
    return res.status(201).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Create curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to create curriculum' })
  }
})

// DELETE /curriculums/:id - delete curriculum
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const curriculum = await Curriculum.findById(req.params.id)
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(curriculum.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    await Curriculum.findByIdAndDelete(req.params.id)
    return res.status(200).json({ status: 'success', message: 'Curriculum deleted' })
  } catch (err) {
    console.error('Delete curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete curriculum' })
  }
})

// POST /curriculums/:id/items - add item to curriculum
router.post('/:id/items', verifyToken, async (req, res) => {
  try {
    const { type, name, description, attachments } = req.body // Changed from attachmentUrl, attachmentType
    const curriculum = await Curriculum.findById(req.params.id)
    
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(curriculum.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    if (!type || !name) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' })
    }
    
    // Calculate position (add at end)
    const position = curriculum.items?.length || 0
    
    const newItem = {
      position,
      type,
      name,
      description: description || '',
      attachments: Array.isArray(attachments) 
        ? attachments.filter(att => att.type !== 'none' && att.url && att.title)
        : [] // Accept array of attachments
    }
    
    curriculum.items.push(newItem)
    await curriculum.save()
    
    return res.status(201).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Add item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add item' })
  }
})

// PUT /curriculums/:id/items/:itemId - update item
router.put('/:id/items/:itemId', verifyToken, async (req, res) => {
  try {
    const { type, name, description, attachments } = req.body // Changed from attachmentUrl, attachmentType
    const curriculum = await Curriculum.findById(req.params.id)
    
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(curriculum.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const item = curriculum.items.id(req.params.itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })
    
    if (type) item.type = type
    if (name) item.name = name
    if (description !== undefined) item.description = description
    if (attachments !== undefined) {
      item.attachments = Array.isArray(attachments) 
        ? attachments.filter(att => att.type !== 'none' && att.url && att.title)
        : []
    }
    
    await curriculum.save()
    return res.status(200).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Update item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to update item' })
  }
})

// DELETE /curriculums/:id/items/:itemId - delete item
router.delete('/:id/items/:itemId', verifyToken, async (req, res) => {
  try {
    const curriculum = await Curriculum.findById(req.params.id)
    
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(curriculum.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const item = curriculum.items.id(req.params.itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })
    
    item.deleteOne()
    await curriculum.save()
    
    return res.status(200).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Delete item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete item' })
  }
})

// POST /curriculums/:id/reorder - reorder items by positions
router.post('/:id/reorder', verifyToken, async (req, res) => {
  try {
    const { itemOrder } = req.body // array of item IDs in new order
    const curriculum = await Curriculum.findById(req.params.id)
    
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(curriculum.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    if (!Array.isArray(itemOrder)) {
      return res.status(400).json({ status: 'error', message: 'itemOrder must be an array' })
    }
    
    // Update positions based on new order
    itemOrder.forEach((itemId, index) => {
      const item = curriculum.items.id(itemId)
      if (item) item.position = index
    })
    
    // Sort items by position
    curriculum.items.sort((a, b) => a.position - b.position)
    await curriculum.save()
    
    return res.status(200).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Reorder items error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to reorder items' })
  }
})

module.exports = router
