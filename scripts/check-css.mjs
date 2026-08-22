/**
 * check-css.mjs — فحص نحوي لملفات CSS عبر postcss قبل التشغيل/البناء.
 *
 * المشكلة التي يعالجها: أخطاء CSS (مثل "Missed semicolon") كانت تظهر فقط
 * كطبقة منبثقة غامضة في المتصفح بعد أن يفشل خادم التطوير. هذا السكربت
 * يُشغَّل تلقائياً قبل `npm run dev` و `npm run build` (عبر predev/prebuild)
 * فيطبع الخطأ بموضعه ومقتطفه في سطر الأوامر فوراً ويخرج برمز غير صفري.
 *
 * الاستخدام:
 *   node scripts/check-css.mjs                # يفحص src/index.css وجميع ملفات CSS
 *   node scripts/check-css.mjs public/foo.css # يفحص ملفاً محدداً
 */
import postcss from 'postcss';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

/** يجمع كل ملفات .css في المشروع (يتجاهل dist و node_modules و src-tauri و .git). */
function collectCssFiles(dir) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'src-tauri', '.git', '.freebuff', '.kilo', 'backups', 'e2e-tests'].includes(entry.name)) continue;
      results = results.concat(collectCssFiles(full));
    } else if (entry.name.endsWith('.css')) {
      results.push(full);
    }
  }
  return results;
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => path.resolve(ROOT, f))
  : collectCssFiles(path.join(ROOT, 'src'))
      .concat(collectCssFiles(path.join(ROOT, 'public')));

if (targets.length === 0) {
  console.log('✅ لا توجد ملفات CSS للفحص');
  process.exit(0);
}

let failed = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.error(`❌ الملف غير موجود: ${path.relative(ROOT, file)}`);
    failed++;
    continue;
  }
  const css = fs.readFileSync(file, 'utf8');
  try {
    postcss.parse(css);
    console.log(`✅ ${path.relative(ROOT, file)} (${css.split('\n').length} سطراً)`);
  } catch (e) {
    failed++;
    const rel = path.relative(ROOT, file);
    console.error(`\n❌ خطأ CSS في ${rel}:${e.line}:${e.column} — ${e.reason || e.message}`);
    if (e.line) {
      const lines = css.split('\n');
      const start = Math.max(1, e.line - 2);
      const end = Math.min(lines.length, e.line + 2);
      const lineNumWidth = String(end).length;
      for (let i = start; i <= end; i++) {
        const marker = i === e.line ? '»' : ' ';
        console.error(`   ${marker} ${String(i).padStart(lineNumWidth)}: ${lines[i - 1]}`);
        if (i === e.line && e.column) {
          // caret aligns with the content: 3 lead spaces + marker + space + number + ": "
          console.error(`     ${' '.repeat(2 + lineNumWidth + (e.column - 1))}▲`);
        }
      }
    }
    console.error('');
  }
}

if (failed > 0) {
  console.error(`✗ فشل فحص CSS: ${failed} ملف به أخطاء. أصلحها قبل التشغيل.`);
  process.exit(1);
}
console.log('\n✅ جميع ملفات CSS سليمة.');
process.exit(0);
