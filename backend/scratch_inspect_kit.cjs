const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/interview-prep');
  const kit = await mongoose.connection.collection('kits').findOne({ _id: new mongoose.Types.ObjectId('6ad909939efae1975336a40e') });
  console.log('Kit keys:', Object.keys(kit));
  console.log('Status:', kit.status);
  console.log('Role/Title:', kit.role || kit.title || kit.roleTitle);
  console.log('Questions count:', kit.questions ? kit.questions.length : 0);
  console.log('Categories count:', kit.categories ? kit.categories.length : 0);
  console.log('Flashcards count:', kit.flashcards ? kit.flashcards.length : 0);
  console.log('Schedule days count:', kit.schedule ? kit.schedule.length : 0);
  console.log('Owner ID:', kit.userId || kit.ownerId);

  // Also find the user who owns it
  const owner = await mongoose.connection.collection('users').findOne({ _id: kit.userId || kit.ownerId });
  if (owner) {
    console.log('Owner email:', owner.email);
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
