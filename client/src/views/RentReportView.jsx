import React from 'react';
import MonthlyPropertyEarningsView from './MonthlyPropertyEarningsView';

export default function RentReportView() {
  return (
    <MonthlyPropertyEarningsView
      mode="rent_report"
      initialBasis="allocatedMonth"
      reportTitle="Rent Report"
      reportSubtitle="Amounts populated based on Month Paid For"
      storagePrefix="rent_report"
      excelFilenamePrefix="Rent_Report_Month_Paid_For"
    />
  );
}
