import { formatDate } from './formatters';

/**
 * 3-State Sort Cycling:
 * 1st click on col: 'desc' (or if was other col -> 'desc')
 * 2nd click on col: 'asc'
 * 3rd click on col: null (cleared / un-sorted)
 */
export function cycleThreeStateSort(prevSort, colId) {
  if (prevSort.key !== colId) {
    return { key: colId, direction: 'desc' };
  }
  if (prevSort.direction === 'desc') {
    return { key: colId, direction: 'asc' };
  }
  return { key: null, direction: null };
}

/**
 * Evaluates a single filter rule against a source value
 * Robust matching supporting composite strings (e.g., "Garage - Shop 1" vs "Garage Shop 1"),
 * numeric values (ignoring ₹ / commas), and case-insensitive normalization.
 */
export function evaluateFilterRule(srcVal, operator, filterVal) {
  const src = String(srcVal ?? '').toLowerCase().trim();
  const target = String(filterVal ?? '').toLowerCase().trim();

  // Normalize delimiters (hyphens, slashes, multiple spaces) for composite labels
  const norm = (s) => s.replace(/[\s\-_/\\,]+/g, ' ').trim();
  const normSrc = norm(src);
  const normTarget = norm(target);

  // Check if both operands are numeric (e.g., rent, deposit, area)
  const rawNumSrc = src.replace(/[^\d.-]/g, '');
  const rawNumTarget = target.replace(/[^\d.-]/g, '');
  const isBothNumbers = rawNumSrc !== '' && rawNumTarget !== '' && !isNaN(Number(rawNumSrc)) && !isNaN(Number(rawNumTarget));

  switch (operator) {
    case 'contains':
      if (isBothNumbers) {
        return rawNumSrc.includes(rawNumTarget) || Number(rawNumSrc) === Number(rawNumTarget);
      }
      return src.includes(target) || normSrc.includes(normTarget);

    case 'does_not_contain':
      if (isBothNumbers) {
        return !rawNumSrc.includes(rawNumTarget) && Number(rawNumSrc) !== Number(rawNumTarget);
      }
      return !src.includes(target) && !normSrc.includes(normTarget);

    case 'equals':
      if (isBothNumbers) {
        return Number(rawNumSrc) === Number(rawNumTarget);
      }
      return (
        src === target ||
        normSrc === normTarget ||
        (src.includes(' - ') && src.split(/\s+-\s+/).some(part => norm(part) === normTarget))
      );

    case 'not_equals':
      if (isBothNumbers) {
        return Number(rawNumSrc) !== Number(rawNumTarget);
      }
      return !(
        src === target ||
        normSrc === normTarget ||
        (src.includes(' - ') && src.split(/\s+-\s+/).some(part => norm(part) === normTarget))
      );

    case 'starts_with':
      return src.startsWith(target) || normSrc.startsWith(normTarget);

    case 'ends_with':
      return src.endsWith(target) || normSrc.endsWith(normTarget);

    case 'greater_than':
      if (isBothNumbers) return Number(rawNumSrc) > Number(rawNumTarget);
      return src > target;

    case 'greater_than_or_equal':
      if (isBothNumbers) return Number(rawNumSrc) >= Number(rawNumTarget);
      return src >= target;

    case 'less_than':
      if (isBothNumbers) return Number(rawNumSrc) < Number(rawNumTarget);
      return src < target;

    case 'less_than_or_equal':
      if (isBothNumbers) return Number(rawNumSrc) <= Number(rawNumTarget);
      return src <= target;

    case 'is_empty':
      return src === '' || src === '—' || src === 'none' || src === 'null' || src === 'n/a' || src === '0';

    case 'is_not_empty':
      return !(src === '' || src === '—' || src === 'none' || src === 'null' || src === 'n/a' || src === '0');

    default:
      return src.includes(target) || normSrc.includes(normTarget);
  }
}

/**
 * Generic sorting utility for table rows
 */
export function sortDataRows(rows, sortConfig, valueExtractors = {}) {
  if (!sortConfig || !sortConfig.key || !sortConfig.direction) {
    return rows;
  }

  const { key, direction } = sortConfig;
  const isAsc = direction === 'asc';

  return [...rows].sort((a, b) => {
    let valA;
    let valB;

    if (valueExtractors[key]) {
      valA = valueExtractors[key](a);
      valB = valueExtractors[key](b);
    } else {
      valA = a[key];
      valB = b[key];
    }

    if (valA === null || valA === undefined) return isAsc ? 1 : -1;
    if (valB === null || valB === undefined) return isAsc ? -1 : 1;

    // Check if both are dates or date strings
    if (key === 'createdAt' || key === 'updatedAt' || key === 'startDate' || key === 'endDate' || key === 'receiptDate') {
      const dateA = new Date(valA).getTime();
      const dateB = new Date(valB).getTime();
      if (!isNaN(dateA) && !isNaN(dateB)) {
        return isAsc ? dateA - dateB : dateB - dateA;
      }
    }

    // Check if both are numbers
    const numA = typeof valA === 'number' ? valA : Number(String(valA).replace(/[^\d.-]/g, ''));
    const numB = typeof valB === 'number' ? valB : Number(String(valB).replace(/[^\d.-]/g, ''));
    if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean' && String(valA).match(/\d/) && String(valB).match(/\d/)) {
      return isAsc ? numA - numB : numB - numA;
    }

    // String comparison
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    if (strA < strB) return isAsc ? -1 : 1;
    if (strA > strB) return isAsc ? 1 : -1;
    return 0;
  });
}

/**
 * Extracts distinct, sorted string values from an array of objects
 */
export function extractUniqueValues(items, extractor) {
  const set = new Set();
  for (const item of items) {
    const val = extractor(item);
    if (val !== null && val !== undefined && String(val).trim() !== '' && String(val).trim() !== '—') {
      set.add(String(val).trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(undefined, { numeric: true, sensitivity: 'base' }));
}
