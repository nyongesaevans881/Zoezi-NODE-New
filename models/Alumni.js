// Alumni Model - Stores graduated student data
const mongoose = require('mongoose');

const alumniSchema = new mongoose.Schema({
  // Basic Info
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  password: { type: String, required: true }, // hashed password
  dateOfBirth: { type: Date },
  gender: { type: String },
  
  // Admission Info
  admissionNumber: { type: String, unique: true, sparse: true },
  applicationRef: { type: String },
  
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
  courseDuration: { type: String, trim: true },
  exams: [
    {
      name: { type: String, trim: true },
      score: { type: String, default: null }, // Final exam grade
    }
  ],
  
  // Media & Status
  profilePicture: { type: String },
  profilePicPublicId: { type: String }, // Cloudinary public ID for deletion
  status: { type: String, default: 'alumni' },
  
  // Graduation Info
  graduationDate: { type: Date, default: Date.now },
  
  // Public Profile Fields
  verified: { type: Boolean, default: true }, // Mark as certified professional
  practiceStatus: { type: String, enum: ['active', 'inactive', 'on_leave', 'retired'], default: 'active' }, // Practicing status
  practicingSince: { type: Date }, // When they started practicing
  currentLocation: { type: String, trim: true }, // Current practice location
  isPublicProfileEnabled: { type: Boolean, default: true }, // Allow viewing public profile
  bio: { type: String, trim: true }, // Professional bio/description
  
  // Password Reset Fields
  resetCode: { type: String, default: null }, // 4-digit reset code
  resetCodeExpiry: { type: Date, default: null }, // When reset code expires
  resetAttempts: { type: Number, default: 0 }, // Track failed reset attempts
  
  // Annual Subscription Fields
  subscriptionPayments: [
    {
      year: { type: Number, required: true }, // Year of payment (e.g., 2025)
      status: { type: String, enum: ['paid', 'pending', 'expired'], default: 'pending' }, // Payment status
      amount: { type: Number, required: true }, // Amount paid
      paymentMethod: { type: String, enum: ['mpesa', 'cash', 'bank_transfer', 'cheque', 'paypal'], default: 'mpesa' }, // Payment method
      transactionId: { type: String }, // M-Pesa receipt number or reference
      paymentDate: { type: Date }, // When payment was made
      expiryDate: { type: Date }, // When subscription expires
      profileActive: { type: Boolean, default: false }, // Whether profile is active for this year
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }
  ],
  
  // CPD (Continuing Professional Development) Records
  cpdRecords: [
    {
      year: { type: Number, required: true }, // Year of CPD exam (e.g., 2025)
      dateTaken: { type: Date, required: true }, // Date exam was taken
      result: { type: String, enum: ['pass', 'fail'], required: true }, // Pass or Fail
      score: { type: Number }, // Score obtained (optional)
      remarks: { type: String, trim: true }, // Additional remarks/notes
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }
  ],
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Alumni = mongoose.model('Alumni', alumniSchema);
module.exports = Alumni;
