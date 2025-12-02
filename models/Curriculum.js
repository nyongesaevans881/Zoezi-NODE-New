const mongoose = require('mongoose')

const curriculumItemSchema = new mongoose.Schema({
  position: { type: Number, default: 0 },
  type: { 
    type: String, 
    enum: ['lesson', 'event', 'cat', 'exam'], 
    required: true 
  },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  attachmentUrl: { type: String, default: '' },
  attachmentType: { 
    type: String,
    enum: ['youtube', 'vimeo', 'mp4', 'pdf', 'article', 'document', 'none'],
    default: 'none'
  },
  createdAt: { type: Date, default: Date.now }
})

const curriculumSchema = new mongoose.Schema({
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  courseName: { type: String, default: '' },
  items: [curriculumItemSchema]
}, {
  timestamps: true
})

module.exports = mongoose.model('Curriculum', curriculumSchema)
