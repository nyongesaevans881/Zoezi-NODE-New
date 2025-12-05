const mongoose = require('mongoose');
const readline = require('readline');
const Alumni = require('../models/Alumni');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

mongoose.connect('mongodb+srv://zoezischoolteam_db_user:2Ror7VvFrDoDEsgY@cluster0.ocwmygf.mongodb.net/Zoezi')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

async function removeDuplicatesWithChoice() {
  try {
    console.log('🔍 Analyzing alumni database...');
    
    // Get summary of duplicates
    const duplicateSummary = await Alumni.aggregate([
      {
        $group: {
          _id: { $toLower: "$email" },
          count: { $sum: 1 },
          records: { $push: { 
            id: "$_id", 
            firstName: "$firstName", 
            lastName: "$lastName", 
            createdAt: "$createdAt",
            admissionNumber: "$admissionNumber"
          }}
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    if (duplicateSummary.length === 0) {
      console.log('✅ No duplicates found in the alumni collection!');
      mongoose.disconnect();
      process.exit(0);
    }

    console.log(`\n📊 Found ${duplicateSummary.length} emails with duplicates:`);
    duplicateSummary.forEach((dup, index) => {
      console.log(`${index + 1}. ${dup._id} - ${dup.count} records`);
    });

    rl.question('\nChoose an option:\n1. Remove all duplicates (keep newest)\n2. Remove all duplicates (keep oldest)\n3. Review each duplicate manually\n4. Cancel\n\nEnter choice (1-4): ', async (choice) => {
      switch(choice) {
        case '1':
          await removeDuplicatesKeepNewest(duplicateSummary);
          break;
        case '2':
          await removeDuplicatesKeepOldest(duplicateSummary);
          break;
        case '3':
          await manualReviewDuplicates(duplicateSummary);
          break;
        case '4':
          console.log('Operation cancelled.');
          break;
        default:
          console.log('Invalid choice.');
      }
      rl.close();
      mongoose.disconnect();
    });

  } catch (error) {
    console.error('❌ Error:', error);
    rl.close();
    mongoose.disconnect();
  }
}

async function removeDuplicatesKeepNewest(duplicateSummary) {
  console.log('\n🗑️  Removing duplicates (keeping newest)...');
  
  let totalDeleted = 0;
  
  for (const dup of duplicateSummary) {
    // Sort by creation date (newest first)
    const sortedRecords = dup.records.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    // Keep the first (newest) record
    const keepId = sortedRecords[0].id;
    const deleteIds = sortedRecords.slice(1).map(r => r.id);
    
    if (deleteIds.length > 0) {
      const result = await Alumni.deleteMany({ _id: { $in: deleteIds } });
      totalDeleted += result.deletedCount;
      console.log(`   ${dup._id}: Kept newest, deleted ${result.deletedCount}`);
    }
  }
  
  console.log(`\n✅ Total deleted: ${totalDeleted} duplicate records`);
}

async function removeDuplicatesKeepOldest(duplicateSummary) {
  console.log('\n🗑️  Removing duplicates (keeping oldest)...');
  
  let totalDeleted = 0;
  
  for (const dup of duplicateSummary) {
    // Sort by creation date (oldest first)
    const sortedRecords = dup.records.sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );
    
    // Keep the first (oldest) record
    const keepId = sortedRecords[0].id;
    const deleteIds = sortedRecords.slice(1).map(r => r.id);
    
    if (deleteIds.length > 0) {
      const result = await Alumni.deleteMany({ _id: { $in: deleteIds } });
      totalDeleted += result.deletedCount;
      console.log(`   ${dup._id}: Kept oldest, deleted ${result.deletedCount}`);
    }
  }
  
  console.log(`\n✅ Total deleted: ${totalDeleted} duplicate records`);
}

async function manualReviewDuplicates(duplicateSummary) {
  console.log('\n🔍 Manual review mode...');
  
  for (const dup of duplicateSummary) {
    console.log(`\n📧 Email: ${dup._id}`);
    console.log('Records found:');
    
    dup.records.forEach((record, index) => {
      console.log(`${index + 1}. ${record.firstName} ${record.lastName} - Admission: ${record.admissionNumber} - Created: ${record.createdAt.toISOString().split('T')[0]}`);
    });
    
    await new Promise((resolve) => {
      rl.question(`Which record to keep? (1-${dup.records.length}, or 's' to skip): `, async (answer) => {
        if (answer.toLowerCase() === 's') {
          console.log('   Skipped.');
          resolve();
          return;
        }
        
        const keepIndex = parseInt(answer) - 1;
        if (keepIndex >= 0 && keepIndex < dup.records.length) {
          const keepId = dup.records[keepIndex].id;
          const deleteIds = dup.records.filter((_, idx) => idx !== keepIndex).map(r => r.id);
          
          const result = await Alumni.deleteMany({ _id: { $in: deleteIds } });
          console.log(`   Kept record ${keepIndex + 1}, deleted ${result.deletedCount} records.`);
        } else {
          console.log('   Invalid choice, skipping.');
        }
        resolve();
      });
    });
  }
  
  console.log('\n✅ Manual review completed.');
}

removeDuplicatesWithChoice();