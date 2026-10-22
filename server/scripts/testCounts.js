const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({ username: String }));
  const user = await User.findOne();
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

  // 1. Fetch counts
  const pRes = await fetch('http://localhost:5000/api/properties', { headers: { 'Authorization': 'Bearer ' + token } });
  const pData = await pRes.json();
  const uRes = await fetch('http://localhost:5000/api/units', { headers: { 'Authorization': 'Bearer ' + token } });
  const uData = await uRes.json();
  const tRes = await fetch('http://localhost:5000/api/tenants', { headers: { 'Authorization': 'Bearer ' + token } });
  const tData = await tRes.json();
  const cRes = await fetch('http://localhost:5000/api/assignments', { headers: { 'Authorization': 'Bearer ' + token } });
  const cData = await cRes.json();

  console.log('Sidebar Counts Verification:');
  console.log('- Properties:', pData.count);
  console.log('- Units/Partitions:', uData.count);
  console.log('- Tenants:', tData.count);
  console.log('- Contracts:', cData.count);

  console.log('\nProperty Sequence:');
  console.log(pData.data.map(p => `${p.displayOrder}. ${p.name}`));

  await mongoose.disconnect();
})();
