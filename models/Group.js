const mongoose = require('mongoose')

const studentResponseSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: { type: String },
  responseText: { type: String, default: '' },
  attachmentUrl: { type: String, default: '' },
  attachmentType: { 
    type: String,
    enum: ['youtube', 'vimeo', 'mp4', 'pdf', 'article', 'document', 'none'],
    default: 'none'
  },
  isQuestion: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false }, // true = public to class, false = private to tutor
  tutorRemark: { type: String, default: '' },
  tutorRemarkAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
})

const groupCurriculumItemSchema = new mongoose.Schema({
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
  releaseDate: { type: Date, default: null },
  releaseTime: { type: String, default: '00:00' }, // HH:mm format
  dueDate: { type: Date, default: null },
  dueTime: { type: String, default: '23:59' }, // HH:mm format
  isReleased: { type: Boolean, default: false },
  sourceItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
  isCompleted: { type: Boolean, default: false }, // Tutor marks as complete
  responses: [studentResponseSchema], // Student submissions, questions, and tutor remarks
  createdAt: { type: Date, default: Date.now }
})

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  courseName: { type: String, default: '' },
  students: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      addedAt: { type: Date, default: Date.now }
    }
  ],
  curriculumItems: [groupCurriculumItemSchema]
}, {
  timestamps: true
})

module.exports = mongoose.model('Group', groupSchema)
