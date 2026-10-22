const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/interview-prep');
  const kits = await mongoose.connection.collection('kits').find({}).toArray();
  console.log(`Found ${kits.length} kit(s) in MongoDB:`);
  for (const k of kits) {
    console.log(`- ID: ${k._id.toString()} | Role: ${k.title || k.role} | Company: ${k.companyName || k.companyUrl} | Owner: ${k.userId || k.ownerId}`);
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
