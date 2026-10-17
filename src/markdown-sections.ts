/** Section edits deliberately reject HTML outside fences rather than guess its block boundaries. */
export function scanSections(body: string) {
  const headings: { title: string; level: number; start: number; content: number; end: number }[] = [];
  let offset = 0, fence: { marker: string; length: number } | undefined, unsupportedHtml = false;
  for (const line of body.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const fenced = /^ {0,3}(`{3,}|~{3,})(.*)\r?\n?$/.exec(line);
    if (fence) {
      if (fenced && fenced[1][0] === fence.marker && fenced[1].length >= fence.length && !fenced[2].trim()) fence = undefined;
    } else if (fenced) fence = { marker: fenced[1][0], length: fenced[1].length };
    else {
      if (/<(?:!--|[!?]|\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>]))/.test(line)) unsupportedHtml = true;
      const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*\r?\n?$/.exec(line);
      if (heading) headings.push({ title: heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim(), level: heading[1].length, start: offset, content: offset + line.length, end: body.length });
    }
    offset += line.length;
  }
  for (let i = 0; i < headings.length; i++) headings[i].end = headings.slice(i + 1).find(h => h.level <= headings[i].level)?.start ?? body.length;
  return { headings, unsupportedHtml };
}

