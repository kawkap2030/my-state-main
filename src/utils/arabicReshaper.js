/**
 * Arabic Text Reshaper for jsPDF
 * 
 * Arabic characters change shape based on position (isolated, initial, medial, final).
 * jsPDF renders characters individually, so we need to map them to their 
 * correct Unicode Presentation Forms (U+FE70–U+FEFF).
 * 
 * This module provides reshapeArabic() which converts standard Arabic text
 * to its visually correct presentation form for PDF rendering.
 */

// Arabic character connection map
// Each entry: [isolated, final, initial, medial]
// Characters that can connect to the next letter have initial/medial forms
const ARABIC_GLYPHS = {
  '\u0621': ['\uFE80'],                          // HAMZA
  '\u0622': ['\uFE81', '\uFE82'],                // ALEF WITH MADDA
  '\u0623': ['\uFE83', '\uFE84'],                // ALEF WITH HAMZA ABOVE
  '\u0624': ['\uFE85', '\uFE86'],                // WAW WITH HAMZA
  '\u0625': ['\uFE87', '\uFE88'],                // ALEF WITH HAMZA BELOW
  '\u0626': ['\uFE89', '\uFE8A', '\uFE8B', '\uFE8C'], // YEH WITH HAMZA
  '\u0627': ['\uFE8D', '\uFE8E'],                // ALEF
  '\u0628': ['\uFE8F', '\uFE90', '\uFE91', '\uFE92'], // BEH
  '\u0629': ['\uFE93', '\uFE94'],                // TEH MARBUTA
  '\u062A': ['\uFE95', '\uFE96', '\uFE97', '\uFE98'], // TEH
  '\u062B': ['\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'], // THEH
  '\u062C': ['\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'], // JEEM
  '\u062D': ['\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'], // HAH
  '\u062E': ['\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'], // KHAH
  '\u062F': ['\uFEA9', '\uFEAA'],                // DAL
  '\u0630': ['\uFEAB', '\uFEAC'],                // THAL
  '\u0631': ['\uFEAD', '\uFEAE'],                // REH
  '\u0632': ['\uFEAF', '\uFEB0'],                // ZAIN
  '\u0633': ['\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'], // SEEN
  '\u0634': ['\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'], // SHEEN
  '\u0635': ['\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'], // SAD
  '\u0636': ['\uFEBD', '\uFEBE', '\uFEBF', '\uFEC0'], // DAD
  '\u0637': ['\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'], // TAH
  '\u0638': ['\uFEC5', '\uFEC6', '\uFEC7', '\uFEC8'], // ZAH
  '\u0639': ['\uFEC9', '\uFECA', '\uFECB', '\uFECC'], // AIN
  '\u063A': ['\uFECD', '\uFECE', '\uFECF', '\uFED0'], // GHAIN
  '\u0640': ['\u0640'],                            // TATWEEL
  '\u0641': ['\uFED1', '\uFED2', '\uFED3', '\uFED4'], // FEH
  '\u0642': ['\uFED5', '\uFED6', '\uFED7', '\uFED8'], // QAF
  '\u0643': ['\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'], // KAF
  '\u0644': ['\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'], // LAM
  '\u0645': ['\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'], // MEEM
  '\u0646': ['\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'], // NOON
  '\u0647': ['\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'], // HEH
  '\u0648': ['\uFEED', '\uFEEE'],                // WAW
  '\u0649': ['\uFEEF', '\uFEF0'],                // ALEF MAKSURA
  '\u064A': ['\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'], // YEH
};

// LAM-ALEF ligatures
const LAM_ALEF_MAP = {
  '\u0622': ['\uFEF5', '\uFEF6'], // LAM + ALEF WITH MADDA
  '\u0623': ['\uFEF7', '\uFEF8'], // LAM + ALEF WITH HAMZA ABOVE
  '\u0625': ['\uFEF9', '\uFEFA'], // LAM + ALEF WITH HAMZA BELOW
  '\u0627': ['\uFEFB', '\uFEFC'], // LAM + ALEF
};

// Characters that DON'T connect to the next letter (right-joiners only)
const RIGHT_JOIN_ONLY = new Set([
  '\u0622', '\u0623', '\u0624', '\u0625', '\u0627', // Alef variants + Waw with Hamza
  '\u062F', '\u0630', '\u0631', '\u0632',             // Dal, Thal, Reh, Zain
  '\u0648', '\u0649',                                  // Waw, Alef Maksura
]);

function isArabicChar(c) {
  const code = c.charCodeAt(0);
  return (code >= 0x0621 && code <= 0x064A) || c === '\u0640';
}

function canConnectAfter(c) {
  // Can this char connect to the letter AFTER it (left-connection)?
  if (!isArabicChar(c)) return false;
  if (RIGHT_JOIN_ONLY.has(c)) return false;
  const glyph = ARABIC_GLYPHS[c];
  // Has initial or medial form = can connect forward
  return glyph && glyph.length >= 3;
}

/**
 * Reshape Arabic text for correct rendering in jsPDF.
 * Converts standard Arabic characters to their presentation forms.
 * Also handles LAM-ALEF ligatures and reverses the text for RTL.
 */
export function reshapeArabic(text) {
  if (!text) return '';
  
  // Process each word/segment
  const result = [];
  const chars = Array.from(text);
  
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    
    if (!isArabicChar(c)) {
      result.push(c);
      i++;
      continue;
    }
    
    // Check for LAM-ALEF ligature
    if (c === '\u0644' && i + 1 < chars.length && LAM_ALEF_MAP[chars[i + 1]]) {
      const ligature = LAM_ALEF_MAP[chars[i + 1]];
      const prevConnects = i > 0 && canConnectAfter(chars[i - 1]) && isArabicChar(chars[i - 1]);
      
      if (prevConnects && ligature.length > 1) {
        result.push(ligature[1]); // Final form of ligature
      } else {
        result.push(ligature[0]); // Isolated form of ligature
      }
      i += 2;
      continue;
    }
    
    const glyph = ARABIC_GLYPHS[c];
    if (!glyph) {
      result.push(c);
      i++;
      continue;
    }
    
    // Determine position
    const prevChar = i > 0 ? chars[i - 1] : null;
    const nextChar = i + 1 < chars.length ? chars[i + 1] : null;
    
    const prevConnects = prevChar && isArabicChar(prevChar) && canConnectAfter(prevChar);
    const nextIsArabic = nextChar && isArabicChar(nextChar);
    const thisCanConnectForward = canConnectAfter(c);
    
    let form;
    if (prevConnects && nextIsArabic && thisCanConnectForward) {
      // Medial (connected on both sides)
      form = glyph[3] || glyph[1] || glyph[0];
    } else if (prevConnects) {
      // Final (connected to previous)
      form = glyph[1] || glyph[0];
    } else if (nextIsArabic && thisCanConnectForward) {
      // Initial (connected to next)
      form = glyph[2] || glyph[0];
    } else {
      // Isolated
      form = glyph[0];
    }
    
    result.push(form);
    i++;
  }
  
  // Reverse the Arabic segments for RTL rendering in jsPDF
  // jsPDF renders text left-to-right, so we need to reverse Arabic runs
  return reverseArabicRuns(result.join(''));
}

/**
 * Reverse Arabic character runs while keeping non-Arabic (numbers, Latin) in order.
 */
function reverseArabicRuns(text) {
  const chars = Array.from(text);
  const segments = [];
  let currentRun = [];
  let currentIsArabic = false;
  
  for (const c of chars) {
    const code = c.charCodeAt(0);
    const isAr = (code >= 0xFE70 && code <= 0xFEFF) || // Presentation Forms B
                 (code >= 0xFB50 && code <= 0xFDFF) || // Presentation Forms A
                 (code >= 0x0600 && code <= 0x06FF) || // Arabic block
                 c === '\u0640';
    
    if (currentRun.length === 0) {
      currentIsArabic = isAr;
      currentRun.push(c);
    } else if (isAr === currentIsArabic) {
      currentRun.push(c);
    } else {
      segments.push({ chars: currentRun, isArabic: currentIsArabic });
      currentRun = [c];
      currentIsArabic = isAr;
    }
  }
  if (currentRun.length > 0) {
    segments.push({ chars: currentRun, isArabic: currentIsArabic });
  }
  
  // Reverse the entire order of segments (for RTL context)
  // and reverse Arabic character segments internally
  const reversed = segments.reverse().map(seg => {
    if (seg.isArabic) {
      return seg.chars.reverse().join('');
    }
    return seg.chars.join('');
  });
  
  return reversed.join('');
}

/**
 * Process a cell value: reshape Arabic, keep numbers as-is
 */
export function reshapeForPDF(value) {
  if (value == null) return '';
  const str = String(value);
  if (!str) return '';
  return reshapeArabic(str);
}
