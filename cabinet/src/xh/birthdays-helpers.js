// Helpers for the birthdays module: date parsing, formatting, age math.

const RU_MONTHS = [
  'января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря',
];
const EN_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isLeapDay(month, day) {
  return month === 2 && day === 29;
}

// Parse loose date strings: "14.05", "14/05", "14.05.1990", "1990-05-14",
// "14 мая", "5/14/1990". Returns {day, month, year|null} or null.
function parseDateLoose(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = +m[1], month = +m[2], day = +m[3];
    if (isValidDay(day, month)) return { day, month, year };
  }
  // dd.mm.yyyy or dd/mm/yyyy or dd-mm-yyyy
  m = s.match(/^(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{2,4}))?$/);
  if (m) {
    const day = +m[1], month = +m[2];
    let year = m[3] ? +m[3] : null;
    if (year && year < 100) year += year > 30 ? 1900 : 2000;
    if (isValidDay(day, month)) return { day, month, year };
  }
  // "14 мая" or "14 may"
  m = s.match(/^(\d{1,2})\s+([а-яa-z]+)(?:\s+(\d{2,4}))?$/i);
  if (m) {
    const day = +m[1];
    const monthName = m[2].toLowerCase();
    const month = monthFromName(monthName);
    let year = m[3] ? +m[3] : null;
    if (year && year < 100) year += year > 30 ? 1900 : 2000;
    if (month && isValidDay(day, month)) return { day, month, year };
  }
  return null;
}

function monthFromName(name) {
  const ru = ['янв','фев','мар','апр','мая','май','июн','июл','авг','сен','окт','ноя','дек'];
  for (let i = 0; i < ru.length; i++) {
    if (name.startsWith(ru[i])) return [1,2,3,4,5,5,6,7,8,9,10,11,12][i];
  }
  const en = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  for (let i = 0; i < en.length; i++) {
    if (name.startsWith(en[i])) return i + 1;
  }
  return null;
}

function isValidDay(day, month) {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const days = [31,29,31,30,31,30,31,31,30,31,30,31];
  return day <= days[month - 1];
}

// MSK timezone — server may be in UTC or anything; we always compute in MSK.
function nowMsk() {
  const utc = new Date();
  // MSK is UTC+3 with no DST
  return new Date(utc.getTime() + 3 * 3600 * 1000);
}

function todayMsk() {
  const d = nowMsk();
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

// Days until next occurrence of (month, day) starting from baseToday (today's MSK).
// Handles leap-day birthdays (Feb 29) by treating them as Feb 28 in non-leap years.
function daysUntil(month, day, baseToday) {
  const today = baseToday || todayMsk();
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const tryYear = (yr) => {
    let m = month, d = day;
    if (isLeapDay(m, d) && !isLeap(yr)) d = 28;
    return new Date(Date.UTC(yr, m - 1, d));
  };
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  let target = tryYear(today.year);
  if (target.getTime() < todayUtc) target = tryYear(today.year + 1);
  const diffMs = target.getTime() - todayUtc;
  return Math.round(diffMs / (24 * 3600 * 1000));
}

function ageThisYear(birthYear, month, day, baseToday) {
  if (!birthYear) return null;
  const today = baseToday || todayMsk();
  let age = today.year - birthYear;
  if (today.month < month || (today.month === month && today.day < day)) {
    age = age - 0;     // hasn't passed yet — they are still age-1, will turn age this year
  }
  // Always show "turning N this year"
  return today.year - birthYear;
}

function formatDate(month, day, lang = 'ru') {
  const months = lang === 'en' ? EN_MONTHS : RU_MONTHS;
  return `${day} ${months[month - 1]}`;
}

function formatRelativeDay(daysLeft, lang = 'ru') {
  if (lang === 'en') {
    if (daysLeft === 0) return 'today';
    if (daysLeft === 1) return 'tomorrow';
    if (daysLeft < 7)  return `in ${daysLeft} days`;
    if (daysLeft < 14) return 'next week';
    return `in ${daysLeft} days`;
  }
  if (daysLeft === 0) return 'сегодня';
  if (daysLeft === 1) return 'завтра';
  if (daysLeft < 5)  return `через ${daysLeft} дня`;
  if (daysLeft < 21) return `через ${daysLeft} дней`;
  if (daysLeft % 10 === 1 && daysLeft % 100 !== 11) return `через ${daysLeft} день`;
  if ([2,3,4].includes(daysLeft % 10) && ![12,13,14].includes(daysLeft % 100)) return `через ${daysLeft} дня`;
  return `через ${daysLeft} дней`;
}

// Sort by upcoming days (ascending — closest first).
function sortByUpcoming(list, baseToday) {
  return [...list].sort((a, b) => {
    const da = daysUntil(a.month, a.day, baseToday);
    const db = daysUntil(b.month, b.day, baseToday);
    return da - db;
  });
}

// Given a list of birthday records, return groups for the dashboard.
function groupByRange(list, baseToday) {
  const today = baseToday || todayMsk();
  const groups = { today: [], week: [], month: [], later: [] };
  for (const b of list) {
    const days = daysUntil(b.month, b.day, today);
    if (days === 0) groups.today.push(b);
    else if (days <= 7) groups.week.push(b);
    else if (days <= 31) groups.month.push(b);
    else groups.later.push(b);
  }
  for (const k of Object.keys(groups)) groups[k] = sortByUpcoming(groups[k], today);
  return groups;
}

module.exports = {
  RU_MONTHS, EN_MONTHS,
  escapeHtml,
  parseDateLoose,
  isValidDay,
  todayMsk,
  daysUntil,
  ageThisYear,
  formatDate,
  formatRelativeDay,
  sortByUpcoming,
  groupByRange,
};
