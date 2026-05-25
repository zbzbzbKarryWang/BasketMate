const now = new Date();
const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // 加8小时
const year = chinaTime.getUTCFullYear();
const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
const day = String(chinaTime.getUTCDate()).padStart(2, '0');
const hour = String(chinaTime.getUTCHours()).padStart(2, '0');
const minute = String(chinaTime.getUTCMinutes()).padStart(2, '0');
const second = String(chinaTime.getUTCSeconds()).padStart(2, '0');
console.log(`${year}-${month}-${day} ${hour}:${minute}:${second}`);
