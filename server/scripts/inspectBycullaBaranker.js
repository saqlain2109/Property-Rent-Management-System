const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Assignment = mongoose.models.TenantAssignment || mongoose.model('TenantAssignment', new mongoose.Schema({}, {strict: false}));
  const Tenant = mongoose.models.Tenant || mongoose.model('Tenant', new mongoose.Schema({}, {strict: false}));
  const RentAgreement = mongoose.models.RentAgreement || mongoose.model('RentAgreement', new mongoose.Schema({}, {strict: false}));
  const Unit = mongoose.models.Unit || mongoose.model('Unit', new mongoose.Schema({}, {strict: false}));
  const by1 = await Unit.findOne({ unitCode: 'BY-1ST' });
  const byMezz = await Unit.findOne({ unitCode: 'BY-MEZZ' });
  
  const allA = await Assignment.find({ unitId: { $in: [by1._id, byMezz._id] } });
  for (const a of allA) {
    const t = await Tenant.findById(a.tenantId);
    const r = await RentAgreement.findOne({ assignmentId: a._id });
    console.log(a.assignmentCode, '| Unit:', a.unitId.toString() === by1._id.toString() ? 'BY-1ST' : 'BY-MEZZ', '| Status:', a.status, '| Tenant:', t?.name, '| Rent:', r?.monthlyRate);
  }
  await mongoose.disconnect();
})();
