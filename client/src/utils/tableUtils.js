import { formatDate } from './formatters.js';

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
 * Supports:
 * - sortDataRows(rows, sortConfig, valueExtractors)
 * - sortDataRows(rows, sortKey, direction, customExtractor)
 * - valueExtractors as an object of functions OR as a single extractor function (item, key) => val
 */
export function sortDataRows(rows, sortConfigOrKey, directionOrExtractors = {}, maybeExtractor = null) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return [];

  let key = null;
  let direction = null;
  let extractor = null;

  if (typeof sortConfigOrKey === 'string') {
    key = sortConfigOrKey;
    direction = typeof directionOrExtractors === 'string' ? directionOrExtractors : 'asc';
    extractor = maybeExtractor || (typeof directionOrExtractors === 'function' ? directionOrExtractors : null);
  } else if (sortConfigOrKey && typeof sortConfigOrKey === 'object') {
    key = sortConfigOrKey.key;
    direction = sortConfigOrKey.direction;
    extractor = directionOrExtractors;
  }

  if (!key || !direction) {
    return rows;
  }

  const isAsc = String(direction).toLowerCase() === 'asc';

  return [...rows].sort((a, b) => {
    let valA;
    let valB;

    if (typeof extractor === 'function') {
      valA = extractor(a, key);
      valB = extractor(b, key);
    } else if (extractor && typeof extractor === 'object' && typeof extractor[key] === 'function') {
      valA = extractor[key](a);
      valB = extractor[key](b);
    } else {
      valA = a ? a[key] : undefined;
      valB = b ? b[key] : undefined;
    }

    if (valA === valB) return 0;
    if (valA === null || valA === undefined || valA === '') return isAsc ? 1 : -1;
    if (valB === null || valB === undefined || valB === '') return isAsc ? -1 : 1;

    // Both are numbers
    if (typeof valA === 'number' && typeof valB === 'number') {
      return isAsc ? valA - valB : valB - valA;
    }

    // Date check (Date instance or YYYY-MM / YYYY-MM-DD string)
    if (valA instanceof Date || valB instanceof Date || (typeof valA === 'string' && /^\d{4}-\d{2}/.test(valA))) {
      const dateA = new Date(valA).getTime();
      const dateB = new Date(valB).getTime();
      if (!isNaN(dateA) && !isNaN(dateB)) {
        return isAsc ? dateA - dateB : dateB - dateA;
      }
    }

    // Number strings check (e.g. ₹9,500 vs ₹10,500)
    const rawA = String(valA).replace(/^[₹$\s,]+|[₹$\s,]+$/g, '').replace(/,/g, '');
    const rawB = String(valB).replace(/^[₹$\s,]+|[₹$\s,]+$/g, '').replace(/,/g, '');
    if (rawA !== '' && rawB !== '' && !isNaN(Number(rawA)) && !isNaN(Number(rawB))) {
      return isAsc ? Number(rawA) - Number(rawB) : Number(rawB) - Number(rawA);
    }

    // String comparison (natural numeric sort)
    return isAsc
      ? String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' })
      : String(valB).localeCompare(String(valA), undefined, { numeric: true, sensitivity: 'base' });
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
