const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  examName: { type: String, required: true },
  grade: {
    type: String,
    enum: ['Distinction', 'Merit', 'Credit', 'Pass', 'Fail'],
    required: true
  },
  recordedAt: { type: Date, default: Date.now }
})

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, unique: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  idNumber: { type: String, required: true, trim: true },
  dob: { type: Date, required: true },
  userType: { type: String, default: 'user' },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  courses: [
    {
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
      name: { type: String },
      duration: { type: Number },
      durationType: { type: String },
      payment: {
        status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
        phone: { type: String },
        transactionId: { type: String },
        amount: { type: Number },
        checkoutRequestId: { type: String },
        timeOfPayment: { type: Date }
      },
      assignmentStatus: { type: String, enum: ['PENDING', 'ASSIGNED', 'CANCELLED'], default: 'PENDING' },
      enrolledAt: { type: Date, default: Date.now },
      adminNotes: { type: String, default: '' },
      isAssignedToGroup: { type: Boolean, default: false },
      assignedGroup: {
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
        groupName: { type: String, default: null }
      },
      tutor: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', default: null },
        name: { type: String, default: null },
        email: { type: String, default: null },
        phone: { type: String, default: null },
        status: { type: String, enum: ['PENDING', 'ASSIGNED', 'CANCELLED'], default: 'PENDING' }
      },
      paymentNotificationHidden: { type: Boolean, default: false },
      // Certification fields
      exams: [examSchema],
      gpa: { type: Number, default: 0 },
      finalGrade: { type: String, default: '' },
      certificationDate: { type: Date, default: null },
      certificationStatus: { type: String, enum: ['PENDING', 'CERTIFIED', 'GRADUATED'], default: 'PENDING' }
    }
  ],
  currentLocation: { type: String, trim: true }, // Current practice location
  admissionNumber: { type: String, unique: true },
  isPublicProfileEnabled: { type: Boolean, default: true }, // Allow viewing public profile
    // Profile Picture
  profilePicture: {
    url: {
      type: String,
      default: null
    },
    cloudinaryId: {
      type: String,
      default: null
    }
  },
   // Emergency Contact
  nextOfKinName: { type: String, trim: true },
  nextOfKinRelationship: { type: String, trim: true },
  nextOfKinPhone: { type: String, trim: true },
});

module.exports = mongoose.model('User', userSchema);
