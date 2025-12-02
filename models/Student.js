// Student Model - Stores admitted student data
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Basic Info
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true,},
  password: { type: String, required: true }, // hashed password
  dateOfBirth: { type: Date },
  gender: { type: String },
    userType: { type: String, default: 'student' },
  
  // Admission Info
  admissionNumber: { type: String, unique: true, sparse: true }, // set by admin during admit
  applicationRef: { type: String }, // reference to applicationNumber
  
  // Education Info
  qualification: { type: String, trim: true },
  course: { type: String, trim: true },
  trainingMode: { type: String, trim: true },
  preferredIntake: { type: String, trim: true },
  preferredStartDate: { type: String, trim: true },
  startDate: { type: Date },
  
  // Personal Details
  citizenship: { type: String, trim: true },
  idNumber: { type: String, trim: true },
  kcseGrade: { type: String, trim: true },
  
  // Application History
  howHeardAbout: { type: [String], default: [] },
  otherSource: { type: String, trim: true },
  
  // Finance
  courseFee: { type: Number },
  upfrontFee: { type: Number },
  feePayer: { type: String, trim: true },
  feePayerPhone: { type: String, trim: true },
  
  // Emergency Contact
  nextOfKinName: { type: String, trim: true },
  nextOfKinRelationship: { type: String, trim: true },
  nextOfKinPhone: { type: String, trim: true },
  
  // Course Specific Info
  courseDuration: { type: String, trim: true }, // e.g., "3 months", "6 months"
  exams: [
    {
      name: { type: String, trim: true }, // e.g., "Practical Exam", "Written Exam"
      score: { type: String, default: null }, // exam grade/score to be updated later
    }
  ],
  
  // Media & Status
  profilePicture: { type: String }, // URL
  profilePicPublicId: { type: String }, // Cloudinary public ID for deletion
  status: { type: String, default: 'active' },
  
  // Public Profile Fields
  verified: { type: Boolean, default: false }, // Mark as certified professional
  practiceStatus: { type: String, enum: ['active', 'inactive', 'on_leave', 'retired'], default: 'active' }, // Practicing status
  practicingSince: { type: Date }, // When they started practicing
  currentLocation: { type: String, trim: true }, // Current practice location
  isPublicProfileEnabled: { type: Boolean, default: true }, // Allow viewing public profile
  bio: { type: String, trim: true }, // Professional bio/description
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);
module.exports = Student;
