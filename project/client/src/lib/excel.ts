import * as XLSX from 'xlsx';
import type { AnalysisResult } from '../types/analysis';

function getFilename(result: AnalysisResult): string {
  try {
    const hostname = new URL(result.url).hostname.replace(/\./g, '-');
    return `techstack-${hostname}.xlsx`;
  } catch {
    return 'techstack-analysis.xlsx';
  }
}

export function downloadExcel(result: AnalysisResult): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tech Stack (categories)
  const techStackRows = result.categories.map((cat) => ({
    Category: cat.category,
    'Current Technology': cat.currentTechnology,
    'Challenges & Pain Points': cat.challengesAndPainPoints,
    'Adobe Opportunity': cat.adobeOpportunity,
  }));
  const wsTech = XLSX.utils.json_to_sheet(techStackRows);
  XLSX.utils.book_append_sheet(wb, wsTech, 'Tech Stack');

  // Sheet 2: Detections (optional)
  if (result.rawDetections.length > 0) {
    const detectionRows = result.rawDetections.map((d) => ({
      Name: d.name,
      Version: d.version ?? '',
      Categories: d.categories.join(', '),
      Confidence: d.confidence,
    }));
    const wsDet = XLSX.utils.json_to_sheet(detectionRows);
    XLSX.utils.book_append_sheet(wb, wsDet, 'Detections');
  }

  XLSX.writeFile(wb, getFilename(result));
}
