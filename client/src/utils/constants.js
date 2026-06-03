export const MAX_SAVED_DOCS = 10;

export const defaultPrefs = {
  theme: 'pink',
  iconSize: 40,
  icons: {
    home: 'computer',
    notes: 'folder',
    study: 'brain',
    calendar: 'calendar',
    focus: 'headphones'
  },
  decorations: []
};

export const defaultProfile = {
  displayName: '',
  age: '',
  field: '',
  bio: '',
  photo: ''
};

export const themeCards = [
  { id: 'pink', title: 'Sakura Pink', subtitle: 'Girly kawaii vibes', image: '/assets/images/cat.png', colors: ['#F4B6C9', '#E06FA5', '#8E70D3', '#BEE8D9'] },
  { id: 'blue', title: 'Ocean Blue', subtitle: 'Cool ocean vibes', image: '/assets/images/blueCat.png', colors: ['#AAD4F4', '#3574D4', '#39ADC1', '#BEE8D9'] },
  { id: 'purple', title: 'Lavender Dream', subtitle: 'Dreamy lavender', image: '/assets/images/turtle.png', colors: ['#DCD0FF', '#765DD6', '#CE5AA6', '#BEE8D9'] },
  { id: 'dark', title: 'Midnight Mode', subtitle: 'Dark midnight mode', image: '/assets/images/ghost.png', colors: ['#2B194C', '#B485F2', '#82C6EA', '#66DBA7'] }
];

export const DECO_PALETTE = ['🌸', '⭐', '💫', '✨', '🌙', '☁️', '💖', '🎀', '📚', '☕', '🌈', '🦋', '🎵', '🍀', '🌟', '💎', '🎨', '🌺'];

export const assets = {
  fallback: '/assets/images/book.png',
  logo: '/assets/images/My_little_star.png',
  girl: '/assets/images/My_little_star.png',
  coffee: '/assets/images/coffee.png',
  book: '/assets/images/book.png',
  folder: '/assets/images/folder.png',
  notes: '/assets/images/folder.png',
  calendar: '/assets/images/calendar.png',
  brain: '/assets/images/brain.png',
  settings: '/assets/images/computer.png',
  computer: '/assets/images/computer.png',
  headphones: '/assets/images/headphones.png',
  timer: '/assets/images/headphones.png',
  music: '/assets/images/music.png',
  ghost: '/assets/images/ghost.png',
  cat: '/assets/images/cat.png',
  blueCat: '/assets/images/blueCat.png',
  jelly: '/assets/images/jelly.png',
  turtle: '/assets/images/turtle.png',
  star: '/assets/images/My_little_star.png',
  document: '/assets/images/book.png',
  server: '/assets/images/computer.png',
  bubble: '/assets/images/brain.png',
  studyBuddy: '/assets/images/book.png'
};

export const iconPaths = {
  image: 'M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 11.5l2.5 3.01L14.5 10l4.5 6H5l3.5-4.5z',
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  notes: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zm-2 16H8v-2h4zm2-4H8v-2h6zm0-4H8v-2h6zm-3-5V3.5L18.5 9z',
  calendar: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z',
  timer: 'M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A7.012 7.012 0 0012 5c-3.87 0-7 3.13-7 7s3.12 7 7 7 7-3.13 7-7c0-1.68-.59-3.22-1.57-4.61zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'
};

export const splashMsgs = [
  'loading studybuddy...',
  'preparing your desk...',
  'attaining dreams...',
  'brewing pixel coffee...',
  'warming up neurons...'
];

export const guideLines = {
  home: 'This is your soft dashboard. Start with notes, study cards, or a calm focus session.',
  notes: 'Drop your material here. I will help turn it into study tools.',
  study: 'Cards, quizzes, and answer practice live here. Small rounds work best.',
  calendar: 'This page keeps your study streak visible without pressure.',
  focus: 'I brought coffee. Start the timer and keep one clear goal in front of you.',
  break: 'Take the break seriously. Your memory needs room to breathe.'
};

export const guideActions = {
  home: 'wave',
  notes: 'read',
  study: 'study',
  calendar: 'wave',
  focus: 'study',
  break: 'coffee'
};

export const companionModes = [
  ['wave', '😊', 'Idle', 'Hi. I am here with you.'],
  ['study', '📚', 'Study', 'Study mode. I will read along.'],
  ['coffee', '☕', 'Break', 'Break mode. Sip, breathe, reset.'],
  ['celebrate', '🎉', 'Celebrate', 'You did something worth celebrating.'],
  ['sleep', '💤', 'Sleep', 'Sleepy mode. Quiet support activated.'],
  ['curious', '👀', 'Curious', 'Curious mode. What are we learning next?']
];
