import React from 'react';
import MonthlyPropertyEarningsView from './MonthlyPropertyEarningsView';

export default function MonthWiseReportView() {
  return (
    <MonthlyPropertyEarningsView
      mode="month_wise"
      initialBasis="receiptDate"
      reportTitle="Month wise Report"
      reportSubtitle="Amounts populated based on Accounting Month"
      storagePrefix="month_wise_report"
      excelFilenamePrefix="Month_Wise_Report_Accounting_Month"
    />
  );
}
