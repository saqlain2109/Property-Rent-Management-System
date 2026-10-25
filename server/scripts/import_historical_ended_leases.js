const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Tenant = require('../models/Tenant');
const TenantAssignment = require('../models/TenantAssignment');
const RentAgreement = require('../models/RentAgreement');
const PaymentReceipt = require('../models/PaymentReceipt');
const PaymentAllocation = require('../models/PaymentAllocation');
const { calculateTenantUnitLedger } = require('../services/rentCalculator');

const contractsData = [
  {
    property: '65 no godown',
    subProperty: '65 Large Godown',
    tenantName: 'Mahendra Bhai',
    contractNo: 'Mahendra-2006',
    contractType: 'Rent',
    rentMonthly: 15000,
    rentAnnual: 180000,
    deposit: 0,
    startDate: '2006-09-01',
    endDate: '2007-08-30',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Large Godown',
    tenantName: 'Mahendra Bhai',
    contractNo: 'Mahendra-2007',
    contractType: 'Rent',
    rentMonthly: 25000,
    rentAnnual: 300000,
    deposit: 0,
    startDate: '2007-09-01',
    endDate: '2008-08-30',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Large Godown',
    tenantName: 'Mahendra Bhai',
    contractNo: 'Mahendra-2008',
    contractType: 'Rent',
    rentMonthly: 30000,
    rentAnnual: 360000,
    deposit: 0,
    startDate: '2008-09-01',
    endDate: '2011-08-30',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Large Godown',
    tenantName: 'Mahendra Bhai',
    contractNo: 'Mahendra-2011',
    contractType: 'Rent',
    rentMonthly: 37500,
    rentAnnual: 450000,
    deposit: 0,
    startDate: '2011-09-01',
    endDate: '2015-08-30',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Large Godown',
    tenantName: 'Mahendra Bhai',
    contractNo: 'Mahendra-2015',
    contractType: 'Rent',
    rentMonthly: 41666.67,
    rentAnnual: 500000,
    deposit: 0,
    startDate: '2015-09-01',
    endDate: '2016-08-30',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Large Godown',
    tenantName: 'Mahendra Bhai',
    contractNo: 'Mahendra-2016',
    contractType: 'Rent',
    rentMonthly: 37500,
    rentAnnual: 450000,
    deposit: 0,
    startDate: '2016-09-01',
    endDate: '2025-03-31',
    status: 'Ended',
    comments: 'Imported FY23 contract for Mahendra Bhai',
    contractCode: 'CON-MAH-8763',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Large Godown',
    tenantName: 'Delhiery',
    contractNo: 'Delhiery-2025',
    contractType: 'Rent',
    rentMonthly: 78750,
    rentAnnual: 945000,
    deposit: 300000,
    startDate: '2025-09-01',
    endDate: '2026-08-30',
    status: 'Ended',
    comments: 'Rents is 1,50,000 and 50% is compnay i.e. 75000 per month. Paid till Mar 26',
    contractCode: 'ASGN-65-LARGE-TEN-DELHIERY-9614',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Small Godown',
    tenantName: 'Akash',
    contractNo: 'Akash-2015',
    contractType: 'Rent',
    rentMonthly: 7500,
    rentAnnual: 90000,
    deposit: 0,
    startDate: '2015-01-01',
    endDate: '2018-01-31',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Small Godown',
    tenantName: 'Alka Industry',
    contractNo: 'Alka-2018',
    contractType: 'Rent',
    rentMonthly: 8500,
    rentAnnual: 102000,
    deposit: 0,
    startDate: '2018-02-01',
    endDate: '2020-01-31',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Small Godown',
    tenantName: 'Alka Industry',
    contractNo: 'Alka-2020',
    contractType: 'Rent',
    rentMonthly: 9000,
    rentAnnual: 108000,
    deposit: 0,
    startDate: '2020-02-01',
    endDate: '2022-02-01',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Small Godown',
    tenantName: 'Alka Industry',
    contractNo: 'Alka-2023',
    contractType: 'Rent',
    rentMonthly: 40000,
    rentAnnual: 480000,
    deposit: 0,
    startDate: '2023-04-01',
    endDate: '2024-03-31',
    status: 'Ended',
    comments: 'Imported FY23 contract for Alka Industry',
    contractCode: 'CON-ALK-8774',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: '65 no godown',
    subProperty: '65 Small Godown',
    tenantName: 'Rehan',
    contractNo: 'Rehan-2026',
    contractType: 'Rent',
    rentMonthly: 9500,
    rentAnnual: 114000,
    deposit: 25000,
    startDate: '2026-02-01',
    endDate: '2026-09-30',
    status: 'Ended',
    comments: 'rent increased',
    contractCode: 'ASGN-65-SMALL-TEN-REHAN-9630',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Barankers room  - Building 65 No',
    subProperty: 'Mezzanine',
    tenantName: 'Umesh',
    contractNo: 'Umesh-2015',
    contractType: 'Rent',
    rentMonthly: 5500,
    rentAnnual: 66000,
    deposit: 0,
    startDate: '2015-04-01',
    endDate: '2018-05-31',
    status: 'Ended',
    comments: 'from april 15',
    contractCode: 'ASGN-BAR-MEZZ-TEN-UMESH-9862',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Barankers room  - Building 65 No',
    subProperty: 'Mezzanine',
    tenantName: 'Uttam',
    contractNo: 'Uttam-2023',
    contractType: 'Rent',
    rentMonthly: 16500,
    rentAnnual: 198000,
    deposit: 0,
    startDate: '2023-04-01',
    endDate: '2024-03-31',
    status: 'Ended',
    comments: 'Imported FY23 contract for Uttam',
    contractCode: 'CON-UTT-8777',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Byculla Club',
    subProperty: '1st Floor',
    tenantName: 'Basar',
    contractNo: 'Basar-2015',
    contractType: 'Rent',
    rentMonthly: 93583,
    rentAnnual: 1122996,
    deposit: 0,
    startDate: '2015-06-01',
    endDate: '2016-05-30',
    status: 'Ended',
    comments: 'pd 1122000 in may 16',
    contractCode: 'ASGN-BY-1ST-TEN-BASAR-9821',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Byculla Club',
    subProperty: '1st Floor',
    tenantName: 'Basar',
    contractNo: 'Basar-2016',
    contractType: 'Rent',
    rentMonthly: 97833.33,
    rentAnnual: 1174000,
    deposit: 0,
    startDate: '2016-06-01',
    endDate: '2023-09-30',
    status: 'Ended',
    comments: 'pd 1122000 in may 16',
    contractCode: 'ASGN-BYC-1STFL-BASAR-1828',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Byculla Club',
    subProperty: '1st Floor',
    tenantName: 'Amir Kids',
    contractNo: 'Amir-2023',
    contractType: 'Rent',
    rentMonthly: 80000,
    rentAnnual: 960000,
    deposit: 300000,
    startDate: '2023-11-01',
    endDate: '2024-10-31',
    status: 'Ended',
    comments: '',
    contractCode: 'ASGN-BYC-1STFL-AMIRKIDS-4356',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Byculla Club',
    subProperty: '1st Floor',
    tenantName: 'Amir Kids',
    contractNo: 'Amir-2024',
    contractType: 'Rent',
    rentMonthly: 88000,
    rentAnnual: 1056000,
    deposit: 300000,
    startDate: '2024-11-01',
    endDate: '2025-10-30',
    status: 'Ended',
    comments: '300000 depsot and rent 80000 from 1st Nov',
    contractCode: 'ASGN-BY-1ST-TEN-AMIRKIDS-9827',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Byculla Club',
    subProperty: 'Mezzanine',
    tenantName: 'Raju Bhai',
    contractNo: 'Raju-2016',
    contractType: 'Rent',
    rentMonthly: 35000,
    rentAnnual: 420000,
    deposit: 0,
    startDate: '2016-10-09',
    endDate: '2019-07-30',
    status: 'Ended',
    comments: 'pd 50,000 in oct 15 and 3,10,000 in nov 15',
    contractCode: 'ASGN-BY-MEZZ-TEN-RAJUBHAI-9841',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Ennas Room',
    subProperty: 'Ennas Room',
    tenantName: 'Bengali',
    contractNo: 'Bengali-2023',
    contractType: 'Rent',
    rentMonthly: 22000,
    rentAnnual: 264000,
    deposit: 0,
    startDate: '2023-02-01',
    endDate: '2024-12-31',
    status: 'Ended',
    comments: 'rent increased from 18000 to 20000 in feb 23',
    contractCode: 'ASGN-ENNAS-RM-TEN-BENGALI-9710',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Garage',
    subProperty: 'Chira Bazar House',
    tenantName: 'Altaf',
    contractNo: 'Altaf-2014',
    contractType: 'Rent',
    rentMonthly: 20000,
    rentAnnual: 240000,
    deposit: 0,
    startDate: '2014-01-01',
    endDate: '2022-03-30',
    status: 'Ended',
    comments: '',
    contractCode: 'ASGN-GAR-CHIRA-ALTAF-6009',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Garage',
    subProperty: 'Shop 1',
    tenantName: 'DG Cable',
    contractNo: 'DG-2013',
    contractType: 'Rent',
    rentMonthly: 35000,
    rentAnnual: 420000,
    deposit: 0,
    startDate: '2013-01-01',
    endDate: '2024-12-31',
    status: 'Ended',
    comments: 'Rent increase in Jan 25, paid 140k for 4 months (Oct 25 - Jan 26) in Feb 26 sheet',
    contractCode: 'ASGN-GA-SHOP1-TEN-DGCABLE-9656',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Garage',
    subProperty: 'Shop 2',
    tenantName: 'Snip - Irfan Ansari',
    contractNo: 'Snip-2014',
    contractType: 'Rent',
    rentMonthly: 23000,
    rentAnnual: 276000,
    deposit: 0,
    startDate: '2014-03-01',
    endDate: '2015-02-28',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Garage',
    subProperty: 'Shop 2',
    tenantName: 'Snip - Irfan Ansari',
    contractNo: 'Snip-2015',
    contractType: 'Rent',
    rentMonthly: 25000,
    rentAnnual: 300000,
    deposit: 0,
    startDate: '2015-03-01',
    endDate: '2019-01-31',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Garage',
    subProperty: 'Shop 2',
    tenantName: 'Snip - Irfan Ansari',
    contractNo: 'Snip-2019',
    contractType: 'Rent',
    rentMonthly: 28000,
    rentAnnual: 336000,
    deposit: 0,
    startDate: '2019-02-01',
    endDate: '2025-05-30',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Garage',
    subProperty: 'Shop 2',
    tenantName: 'Snip - Irfan Ansari',
    contractNo: 'Snip-2025',
    contractType: 'Rent',
    rentMonthly: 32000,
    rentAnnual: 384000,
    deposit: 0,
    startDate: '2025-06-01',
    endDate: '2026-06-01',
    status: 'Ended',
    comments: 'rent increase in june 2025, paid till Mar 26',
    contractCode: 'ASGN-GA-SHOP2-TEN-SNIPIRFA-9665',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Goa Flat',
    subProperty: 'Flat no 1',
    tenantName: 'Asif',
    contractNo: 'Asif-2024',
    contractType: 'Rent',
    rentMonthly: 22000,
    rentAnnual: 264000,
    deposit: 0,
    startDate: '2024-06-01',
    endDate: '2025-10-31',
    status: 'Ended',
    comments: 'rent increased to 22000, paid till Mar 26',
    contractCode: 'ASGN-GOA-FLAT1-TEN-ASIF-9789',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Goa Flat',
    subProperty: 'Flat no 1',
    tenantName: 'Asif',
    contractNo: 'Asif-2025',
    contractType: 'Rent',
    rentMonthly: 22000,
    rentAnnual: 264000,
    deposit: 0,
    startDate: '2025-11-01',
    endDate: '2026-08-30',
    status: 'Ended',
    comments: 'rent increased to 22000, paid till Mar 26',
    contractCode: 'ASGN-GOA-FLATN-ASIF-7754',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Kandivli',
    subProperty: 'Flat No 2108',
    tenantName: 'Tenant 2108 (Fatu)',
    contractNo: 'Tenant-2020-1',
    contractType: 'Rent',
    rentMonthly: 12000,
    rentAnnual: 144000,
    deposit: 0,
    startDate: '2020-01-01',
    endDate: '2023-12-31',
    status: 'Ended',
    comments: 'rent was 11000',
    contractCode: 'ASGN-KAND-2108-TEN-TENANT21-9890',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Kandivli',
    subProperty: 'Flat No 2109',
    tenantName: 'Tenant 2109',
    contractNo: 'Tenant-2020-2',
    contractType: 'Rent',
    rentMonthly: 12000,
    rentAnnual: 144000,
    deposit: 0,
    startDate: '2020-01-01',
    endDate: '2023-12-31',
    status: 'Ended',
    comments: 'rent was 11000',
    contractCode: 'ASGN-KAND-2109-TEN-TENANT2109-3831',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Mani Mansion',
    subProperty: 'Mani Mansion -Room 1',
    tenantName: 'Munshi',
    contractNo: 'Munshi-2023',
    contractType: 'Rent',
    rentMonthly: 24000,
    rentAnnual: 288000,
    deposit: 0,
    startDate: '2023-04-01',
    endDate: '2024-02-29',
    status: 'Ended',
    comments: 'Imported FY23 contract for Munshi',
    contractCode: 'CON-MUN-8781',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Mani Mansion',
    subProperty: 'Mani Mansion -Room 1',
    tenantName: 'Dinesh',
    contractNo: 'Dinesh-2017',
    contractType: 'Rent',
    rentMonthly: 13000,
    rentAnnual: 156000,
    deposit: 0,
    startDate: '2017-02-01',
    endDate: '2019-02-28',
    status: 'Ended',
    comments: 'from feb 2017',
    contractCode: 'ASGN-MANI-RM1-TEN-DINESH-9745',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Mani Mansion',
    subProperty: 'Mani Mansion -Room 1',
    tenantName: 'Dinesh',
    contractNo: 'Dinesh-2019',
    contractType: 'Rent',
    rentMonthly: 13500,
    rentAnnual: 162000,
    deposit: 0,
    startDate: '2019-03-06',
    endDate: '2020-12-31',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Mani Mansion',
    subProperty: 'Mani Mansion -Room 1',
    tenantName: 'Dinesh',
    contractNo: 'Dinesh-2021',
    contractType: 'Rent',
    rentMonthly: 12000,
    rentAnnual: 144000,
    deposit: 0,
    startDate: '2021-01-01',
    endDate: '2021-08-30',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Mani Mansion',
    subProperty: 'Mani Mansion -Room 1',
    tenantName: 'Aswini Derad Monga',
    contractNo: 'Aswini-2026',
    contractType: 'Rent',
    rentMonthly: 16000,
    rentAnnual: 192000,
    deposit: 50000,
    startDate: '2026-02-01',
    endDate: '2026-07-30',
    status: 'Ended',
    comments: 'rents increase to 16000 in feb 26, paid till Mar 26',
    contractCode: 'ASGN-MANI-RM1-TEN-ASWINIDE-9768',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Mani Mansion',
    subProperty: 'Mani Mansion -Room 1',
    tenantName: 'Aswini Derad Monga',
    contractNo: 'Aswini-2024',
    contractType: 'Rent',
    rentMonthly: 16000,
    rentAnnual: 192000,
    deposit: 50000,
    startDate: '2024-03-01',
    endDate: '2026-01-31',
    status: 'Ended',
    comments: 'from Jan 24 deposit 50,000, paid till Mar 26',
    contractCode: 'ASGN-MANI-RM1-TEN-ASWINIDE-9761',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Mani Mansion',
    subProperty: 'Mani Mansion -Room 1',
    tenantName: 'Jayanti Bhai',
    contractNo: 'Jayanti-2021',
    contractType: 'Rent',
    rentMonthly: 12000,
    rentAnnual: 144000,
    deposit: 50000,
    startDate: '2021-09-01',
    endDate: '2023-02-28',
    status: 'Ended',
    comments: 'from sep 21',
    contractCode: 'ASGN-MANI-RM1-TEN-JAYANTIB-9754',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Room No 10 - Building 65 No',
    subProperty: 'Room No 10 - Building 65 No',
    tenantName: 'Tenant X',
    contractNo: 'TenantX-2018',
    contractType: 'Rent',
    rentMonthly: 7500,
    rentAnnual: 90000,
    deposit: 0,
    startDate: '2018-10-01',
    endDate: '2019-10-01',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Room No 10 - Building 65 No',
    subProperty: 'Room No 10 - Building 65 No',
    tenantName: 'Maulana',
    contractNo: 'Maulana-2022',
    contractType: 'Rent',
    rentMonthly: 8500,
    rentAnnual: 102000,
    deposit: 0,
    startDate: '2022-08-01',
    endDate: '2023-08-01',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Room No 10 - Building 65 No',
    subProperty: 'Room No 10 - Building 65 No',
    tenantName: 'Maulana',
    contractNo: 'Maulana-2020',
    contractType: 'Rent',
    rentMonthly: 8000,
    rentAnnual: 96000,
    deposit: 0,
    startDate: '2020-12-01',
    endDate: '2022-06-01',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Room No 10 - Building 65 No',
    subProperty: 'Room No 10 - Building 65 No',
    tenantName: 'Kamlesh',
    contractNo: 'Kamlesh-2023',
    contractType: 'Rent',
    rentMonthly: 8000,
    rentAnnual: 96000,
    deposit: 20000,
    startDate: '2023-10-01',
    endDate: '2024-09-30',
    status: 'Ended',
    comments: 'from Oct 23 paid 20000 deposit',
    contractCode: 'ASGN-ROOM-10-TEN-KAMLESH-9875',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Tony room (Roshan Manzil)',
    subProperty: 'Tony Room 2',
    tenantName: 'Vinay Singh',
    contractNo: 'Vinay-2022',
    contractType: 'Rent',
    rentMonthly: 8000,
    rentAnnual: 96000,
    deposit: 0,
    startDate: '2022-04-01',
    endDate: '2023-03-31',
    status: 'Ended',
    comments: '',
    contractCode: '',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Tony room (Roshan Manzil)',
    subProperty: 'Tony Room 2',
    tenantName: 'Vinay Singh',
    contractNo: 'Vinay-2023',
    contractType: 'Rent',
    rentMonthly: 9000,
    rentAnnual: 108000,
    deposit: 0,
    startDate: '2023-04-01',
    endDate: '2025-02-28',
    status: 'Ended',
    comments: 'Imported FY23 contract for Vinay Singh',
    contractCode: 'CON-VIN-8785',
    rentFrequency: 'Monthly Fixed'
  },
  {
    property: 'Tony room (Roshan Manzil)',
    subProperty: 'Tony Room 2',
    tenantName: 'Santu Hajra',
    contractNo: 'Santu-2024',
    contractType: 'Rent',
    rentMonthly: 10000,
    rentAnnual: 120000,
    deposit: 0,
    startDate: '2025-03-01',
    endDate: '2026-03-31',
    status: 'Ended',
    comments: 'Paid till Mar 26, left in Mar 26',
    contractCode: 'ASGN-TONY-RM2-TEN-SANTUHAJ-9805',
    rentFrequency: 'Monthly Fixed'
  }
];

async function run() {
  await connectDB();
  console.log('MongoDB connected successfully');

  // 1. Ensure all missing tenants exist
  const tenantMap = {};
  const allTenants = await Tenant.find();
  allTenants.forEach(t => {
    tenantMap[t.name.trim().toLowerCase()] = t;
  });

  async function getOrCreateTenant(name) {
    const key = name.trim().toLowerCase();
    if (tenantMap[key]) return tenantMap[key];
    const code = 'TEN-' + name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const newT = await Tenant.create({
      name: name.trim(),
      tenantCode: code,
      contactPerson: name.trim(),
      phone: '',
      email: '',
      status: 'Inactive'
    });
    console.log(`Created new tenant: ${name} (${code})`);
    tenantMap[key] = newT;
    return newT;
  }

  // Pre-create/fetch required tenants
  for (const item of contractsData) {
    await getOrCreateTenant(item.tenantName);
  }

  // 2. Fetch properties and units
  const allUnits = await Unit.find().populate('propertyId');
  function findUnit(propName, subPropName) {
    return allUnits.find(u => {
      const p = (u.propertyId?.name || '').trim().toLowerCase();
      const s = (u.subUnitPartition || u.unitName || '').trim().toLowerCase();
      return p === propName.trim().toLowerCase() && s === subPropName.trim().toLowerCase();
    });
  }

  // Set boundary on superseded open-ended assignments before processing
  await TenantAssignment.updateOne(
    { assignmentCode: 'ASGN-GOA-FLAT1-TEN-ASIF-9784' },
    { $set: { endDate: new Date('2024-05-31T00:00:00.000Z'), status: 'Ended' } }
  );
  await TenantAssignment.updateOne(
    { assignmentCode: 'ASGN-GA-SHOP1-TEN-DGCABLE-9656' },
    { $set: { endDate: new Date('2024-12-31T00:00:00.000Z'), status: 'Ended' } }
  );
  await TenantAssignment.updateOne(
    { assignmentCode: 'ASGN-KAND-2109-TEN-TENANT2109-3831' },
    { $set: { endDate: new Date('2023-12-31T00:00:00.000Z'), status: 'Ended' } }
  );

  console.log('\n--- Processing 44 Contract Records ---');
  let updatedCount = 0;
  let createdCount = 0;
  const processedRecords = [];

  for (let idx = 0; idx < contractsData.length; idx++) {
    const row = contractsData[idx];
    const unit = findUnit(row.property, row.subProperty);
    if (!unit) {
      console.error(`Unit not found for: ${row.property} -> ${row.subProperty}`);
      continue;
    }
    const tenant = await getOrCreateTenant(row.tenantName);

    let assign = null;
    if (row.contractCode) {
      assign = await TenantAssignment.findOne({ assignmentCode: row.contractCode });
    }
    if (!assign && row.contractNo) {
      assign = await TenantAssignment.findOne({ unitId: unit._id, contractNo: row.contractNo });
    }

    const startD = row.startDate ? new Date(row.startDate + 'T00:00:00.000Z') : null;
    const endD = row.endDate ? new Date(row.endDate + 'T00:00:00.000Z') : null;

    if (assign) {
      // Update existing assignment
      assign.contractNo = row.contractNo;
      assign.startDate = startD;
      assign.endDate = endD;
      assign.depositHeld = row.deposit;
      assign.notes = row.comments;
      assign.status = 'Ended';
      assign.contractType = 'Rent';
      await assign.save();

      // Upsert or update rent agreement
      let agreement = await RentAgreement.findOne({ assignmentId: assign._id });
      if (!agreement) {
        agreement = await RentAgreement.create({
          assignmentId: assign._id,
          unitId: unit._id,
          tenantId: tenant._id,
          contractType: 'Rent',
          rentType: row.rentFrequency,
          monthlyRate: row.rentMonthly,
          annualRate: row.rentAnnual,
          effectiveFrom: startD,
          effectiveTo: endD,
          terms: row.comments || '',
          isCurrentRate: false
        });
      } else {
        agreement.contractType = 'Rent';
        agreement.rentType = row.rentFrequency;
        agreement.monthlyRate = row.rentMonthly;
        agreement.annualRate = row.rentAnnual;
        agreement.effectiveFrom = startD;
        agreement.effectiveTo = endD;
        agreement.terms = row.comments || agreement.terms;
        agreement.isCurrentRate = false;
        await agreement.save();
      }

      updatedCount++;
      processedRecords.push({
        ...row,
        dbCode: assign.assignmentCode,
        assignId: assign._id
      });
    } else {
      // Create missing assignment
      const totalCount = await TenantAssignment.countDocuments();
      const newCode = `ASGN-${unit.unitCode || 'HIST'}-${String(totalCount + 1).padStart(4, '0')}`;

      const newAssign = await TenantAssignment.create({
        assignmentCode: newCode,
        contractNo: row.contractNo,
        tenantId: tenant._id,
        unitId: unit._id,
        startDate: startD,
        endDate: endD,
        depositHeld: row.deposit,
        contractType: 'Rent',
        notes: row.comments,
        status: 'Ended'
      });

      await RentAgreement.create({
        assignmentId: newAssign._id,
        unitId: unit._id,
        tenantId: tenant._id,
        contractType: 'Rent',
        rentType: row.rentFrequency,
        monthlyRate: row.rentMonthly,
        annualRate: row.rentAnnual,
        effectiveFrom: startD,
        effectiveTo: endD,
        terms: row.comments || '',
        isCurrentRate: false
      });

      createdCount++;
      row.contractCode = newCode;
      processedRecords.push({
        ...row,
        dbCode: newCode,
        assignId: newAssign._id
      });
    }
  }

  console.log(`\nProcessing Complete:`);
  console.log(`  Updated existing contracts: ${updatedCount}`);
  console.log(`  Created missing contracts: ${createdCount}`);
  console.log(`  Total contracts in dataset: ${processedRecords.length}`);

  // 3. Compute ledger figures for each of the 44 contracts
  console.log('\n--- Computing Financial Ledgers for all 44 Contracts ---');
  const enrichedResults = [];

  for (const item of processedRecords) {
    const unit = findUnit(item.property, item.subProperty);
    const tenant = tenantMap[item.tenantName.trim().toLowerCase()];
    const assign = await TenantAssignment.findById(item.assignId);

    let totalAllocated = 0;
    let totalOutstanding = 0;

    try {
      const ledger = await calculateTenantUnitLedger(unit._id, tenant._id, null, assign);
      totalAllocated = ledger.totalAllocated || 0;
      totalOutstanding = ledger.totalOutstanding || 0;
    } catch (e) {
      console.warn(`Error calculating ledger for ${item.contractNo}:`, e.message);
    }

    enrichedResults.push({
      Property: item.property,
      'Sub Property / Partition': item.subProperty,
      Tenant: item.tenantName,
      'Contract No': item.contractNo,
      'Contract Type': item.contractType,
      'Rent Per month': item.rentMonthly,
      'Rent per Annum': item.rentAnnual,
      Deposit: item.deposit,
      'Start Date': item.startDate,
      'End Date': item.endDate,
      'Contract Status': item.status,
      Comments: item.comments,
      'Contract Code': item.contractCode || item.dbCode,
      'Rent Frequency': item.rentFrequency,
      'Total Received (₹)': totalAllocated,
      'Outstanding Balance (₹)': totalOutstanding
    });
  }

  // 4. Check for any overlaps across all units
  console.log('\n--- Verifying Overlaps Across All Units in Database ---');
  let hasOverlap = false;
  for (const u of allUnits) {
    const list = await TenantAssignment.find({ unitId: u._id, status: { $nin: ['Terminated', 'Cancelled'] } })
      .populate('tenantId')
      .sort({ startDate: 1 });

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const sA = a.startDate ? a.startDate.toISOString().slice(0, 10) : '0000-01-01';
        const eA = a.endDate ? a.endDate.toISOString().slice(0, 10) : '9999-12-31';
        const sB = b.startDate ? b.startDate.toISOString().slice(0, 10) : '0000-01-01';
        const eB = b.endDate ? b.endDate.toISOString().slice(0, 10) : '9999-12-31';

        if (sA <= eB && eA >= sB) {
          console.error(`[COLLISION in ${u.subUnitPartition || u.unitName}]:`);
          console.error(`  ${a.contractNo || a.assignmentCode} (${a.tenantId?.name}): ${sA} to ${eA}`);
          console.error(`  ${b.contractNo || b.assignmentCode} (${b.tenantId?.name}): ${sB} to ${eB}`);
          hasOverlap = true;
        }
      }
    }
  }

  if (!hasOverlap) {
    console.log('EXCELLENT: Zero date overlaps across ALL properties and sub-properties!');
  }

  // Output enrichedResults as JSON to a scratch file
  const fs = require('fs');
  fs.writeFileSync(
    'C:/Users/Admin/.gemini/antigravity/brain/fd38458d-e7af-4d42-854b-a04e9112cacc/scratch/final_enriched_ended_leases.json',
    JSON.stringify(enrichedResults, null, 2)
  );

  console.log('Saved final enriched results to scratch/final_enriched_ended_leases.json');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error running import:', err);
  process.exit(1);
});
