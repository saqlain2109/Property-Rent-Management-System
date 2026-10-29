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

const MONTH_NAMES_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

/**
 * Parses any month string, ISO representation, or date into an array of chronological integers (YYYYMM).
 * Examples:
 *  'Jan 2026' -> [202601]
 *  'Feb 26' -> [202602]
 *  'March 2026' -> [202603]
 *  'Sept 25' -> [202509]
 *  '2026-02' -> [202602]
 *  'Jan 2026, Feb 2026' -> [202601, 202602]
 */
export function parseMonthChronological(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return [val.getFullYear() * 100 + (val.getMonth() + 1)];
  }

  if (Array.isArray(val)) {
    const list = [];
    for (const item of val) {
      const parsed = parseMonthChronological(item);
      if (parsed) list.push(...parsed);
    }
    return list.length > 0 ? list : null;
  }

  const str = String(val).trim();
  if (!str || str === '—' || str === '-' || str === 'null' || str === 'undefined') return null;

  const segments = str.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const result = [];

  for (const seg of segments) {
    // 1. Check for YYYY-MM or YYYY/MM (e.g., 2026-02 or 2026-02-15)
    const isoMatch = seg.match(/\b(19\d\d|20\d\d)[-/](0?[1-9]|1[0-2])\b/);
    if (isoMatch) {
      result.push(parseInt(isoMatch[1], 10) * 100 + parseInt(isoMatch[2], 10));
      continue;
    }

    // 2. Check for MM/YYYY or MM-YYYY
    const mmYyyyMatch = seg.match(/\b(0?[1-9]|1[0-2])[-/](19\d\d|20\d\d)\b/);
    if (mmYyyyMatch) {
      result.push(parseInt(mmYyyyMatch[2], 10) * 100 + parseInt(mmYyyyMatch[1], 10));
      continue;
    }

    // 3. Check for month name followed or preceded by 2 or 4 digit year
    const words = seg.replace(/[-_.'’]/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
    let mNum = null;
    let yNum = null;

    for (const w of words) {
      const cleanW = w.replace(/[^a-z]/g, '');
      if (!mNum && MONTH_NAMES_MAP[cleanW]) {
        mNum = MONTH_NAMES_MAP[cleanW];
      }
      const digits = w.replace(/[^0-9]/g, '');
      if (!yNum && (digits.length === 2 || digits.length === 4)) {
        let yr = parseInt(digits, 10);
        if (digits.length === 2) {
          yr = yr < 50 ? 2000 + yr : 1900 + yr;
        }
        if (yr >= 1970 && yr <= 2099) {
          yNum = yr;
        }
      }
    }

    if (mNum && yNum) {
      result.push(yNum * 100 + mNum);
    }
  }

  return result.length > 0 ? result : null;
}

/**
 * Compares two arrays of chronological month integers [YYYYMM, ...]
 */
export function compareChronologicalMonths(monthsA, monthsB) {
  const len = Math.max(monthsA.length, monthsB.length);
  for (let i = 0; i < len; i++) {
    const mA = monthsA[i] !== undefined ? monthsA[i] : -Infinity;
    const mB = monthsB[i] !== undefined ? monthsB[i] : -Infinity;
    if (mA !== mB) return mA - mB;
  }
  return 0;
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
  const isMonthCol = key && /month/i.test(key);

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

    // Chronological Month check (e.g. accountingMonth, monthsCovered, 'Jan 2026', 'Feb 26', '2026-02')
    const monthsA = parseMonthChronological(valA);
    const monthsB = parseMonthChronological(valB);
    const hasFullDayDate = /^\d{4}-\d{2}-\d{2}/.test(String(valA)) || /^\d{4}-\d{2}-\d{2}/.test(String(valB));

    if (monthsA && monthsB && (isMonthCol || !hasFullDayDate)) {
      const cmp = compareChronologicalMonths(monthsA, monthsB);
      if (cmp !== 0) {
        return isAsc ? cmp : -cmp;
      }
    }

    // Date check (Date instance or YYYY-MM-DD / ISO date string)
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
  return Array.from(set).sort((a, b) => {
    const mA = parseMonthChronological(a);
    const mB = parseMonthChronological(b);
    if (mA && mB) {
      return compareChronologicalMonths(mA, mB);
    }
    return a.localeCompare(undefined, { numeric: true, sensitivity: 'base' });
  });
}
